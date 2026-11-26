import { createHash, timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { getPublishedPrices } from '@/lib/sugar-prices/cache.mjs';

const JSON_TYPE = 'application/json; charset=utf-8';

type PriceRow = {
  mill_name: string;
  mill_slug: string;
  price_kes_per_50kg: number;
  price_kes_per_kg: number;
  factory_id: string | null;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function errorResponse(status: number, code: string, message: string, headers: HeadersInit = {}) {
  return new Response(JSON.stringify({ version: '1', error: { code, message } }), {
    status,
    headers: { 'content-type': JSON_TYPE, 'cache-control': 'no-store', ...headers },
  });
}

export async function GET(request: Request) {
  // Opt out of any build-time prerendering: this endpoint must run per request.
  await connection();

  const expectedKey = process.env.PRICES_API_KEY;
  if (expectedKey) {
    const authorization = request.headers.get('authorization') ?? '';
    const bearer = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : '';
    const provided = request.headers.get('x-api-key') ?? bearer;

    if (!provided || !keysMatch(provided, expectedKey)) {
      return errorResponse(401, 'unauthorized', 'Provide a valid API key via x-api-key or Authorization: Bearer.', {
        'www-authenticate': 'Bearer realm="sugar-prices"',
      });
    }
  }

  try {
    const url = new URL(request.url);
    const mill = url.searchParams.get('mill')?.trim().toLowerCase() || null;
    const factory = url.searchParams.get('factory_id')?.trim().toUpperCase() || null;

    const published = await getPublishedPrices();
    if (!published) {
      return errorResponse(503, 'prices_unavailable', 'Price cache is not ready.');
    }
    const payload = published.payload;

    // Upstream is polled monthly, but the CDN edge is capped at an hour so a
    // manual refresh is visible quickly. Origin answers in ~8 ms, so this costs
    // almost nothing.
    const edgeTtl = Math.min(Number(payload.cache.ttl_seconds), 3600);
    const cacheControl = expectedKey
      ? 'private, max-age=60, must-revalidate'
      : `public, max-age=60, s-maxage=${edgeTtl}, stale-while-revalidate=86400`;

    // Hot path: the overwhelming majority of calls are unfiltered, so the body
    // was serialised once at refresh time and is returned as-is.
    if (!mill && !factory) {
      const headers = new Headers({
        'content-type': JSON_TYPE,
        'cache-control': cacheControl,
        etag: published.etag,
        vary: 'x-api-key, authorization, if-none-match',
        'x-data-origin': payload.data_origin,
        'x-observed-at': payload.observed_at,
        'x-prices-stale': String(payload.stale),
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      });

      if (request.headers.get('if-none-match') === published.etag) {
        return new Response(null, { status: 304, headers });
      }

      return new Response(published.json, { status: 200, headers });
    }

    let data = payload.data as PriceRow[];
    if (mill) data = data.filter((row) => row.mill_slug === mill);
    if (factory) data = data.filter((row) => row.factory_id === factory);

    const etag = `W/"${sha256(`${payload.data_version}|${mill ?? ''}|${factory ?? ''}`).slice(0, 32)}"`;
    const headers = new Headers({
      'content-type': JSON_TYPE,
      'cache-control': cacheControl,
      etag,
      vary: 'x-api-key, authorization, if-none-match',
      'x-data-origin': payload.data_origin,
      'x-observed-at': payload.observed_at,
      'x-prices-stale': String(payload.stale),
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    });

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(JSON.stringify({ ...payload, mill_count: data.length, data }), {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(503, 'prices_unavailable', message);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'x-api-key, authorization, if-none-match',
      'access-control-max-age': '86400',
    },
  });
}
