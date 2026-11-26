import { timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { refreshPrices } from '@/lib/sugar-prices/cache.mjs';

const JSON_TYPE = 'application/json; charset=utf-8';

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_TYPE, 'cache-control': 'no-store' },
  });
}

/**
 * Manual refresh for the month-long polling window: after KSB publishes a new
 * ticker, an operator can pull it immediately instead of waiting for the TTL.
 * Disabled unless PRICES_REFRESH_TOKEN is configured.
 */
export async function POST(request: Request) {
  await connection();

  const expected = process.env.PRICES_REFRESH_TOKEN;
  if (!expected) {
    return json(503, {
      version: '1',
      error: { code: 'refresh_disabled', message: 'Set PRICES_REFRESH_TOKEN to enable manual refreshes.' },
    });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const provided = request.headers.get('x-refresh-token') ?? bearer;

  if (!provided || !tokenMatches(provided, expected)) {
    return json(401, {
      version: '1',
      error: { code: 'unauthorized', message: 'Provide the refresh token via x-refresh-token or Authorization: Bearer.' },
    });
  }

  const result = await refreshPrices({ force: true });
  const failed = Boolean(result && 'error' in result && result.error);

  return json(failed ? 502 : 200, {
    version: '1',
    refreshed_at: new Date().toISOString(),
    ...result,
  });
}
