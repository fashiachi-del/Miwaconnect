import { createHash } from 'node:crypto';
import {
  PRICE_UNIT,
  PriceParseError,
  SOURCE_ID,
  SOURCE_NAME,
  SOURCE_URL,
  htmlToText,
  parseMiwaBoraHtml,
} from './parse.mjs';
import { fetchMiwaBoraHtml } from './upstream.mjs';
import { BUNDLED_SNAPSHOT } from './fallback.mjs';

/**
 * @typedef {Object} PriceRow
 * @property {string} mill_name
 * @property {string} mill_slug
 * @property {number} price_kes_per_50kg
 * @property {number} price_kes_per_kg
 * @property {string | null} factory_id
 */

/**
 * @typedef {Object} PricePayload
 * @property {string} version
 * @property {{ id: string, name: string, url: string, method: string, official_api: boolean }} source
 * @property {string} unit
 * @property {string} data_version
 * @property {string} data_origin
 * @property {string} observed_at
 * @property {string | null} fetched_at
 * @property {string | null} last_checked_at
 * @property {string | null} last_success_at
 * @property {number | null} age_days
 * @property {boolean} stale
 * @property {string | null} stale_reason
 * @property {number} mill_count
 * @property {PriceRow[]} data
 * @property {Record<string, number | string | boolean | object | null>} cache
 */

/**
 * @typedef {Object} Published
 * @property {PricePayload} payload
 * @property {string} json
 * @property {string} etag
 * @property {number} builtAt
 * @property {number} staleAt
 * @property {boolean} stale
 */

const MIN_PRICE = 3000;
const MAX_PRICE = 15000;
const MIN_MILLS = 5;
const DAY_MS = 86_400_000;

/**
 * Tunables, read from the environment on every refresh.
 *
 * Defaults are deliberately slow: KSB updates once a day, the ticker is a
 * government page, and this endpoint must never be the reason it gets hammered.
 */
function config() {
  const seconds = (name, fallback, min, max) => {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    return Math.min(max, Math.max(min, value)) * 1000;
  };

  const days = Number.parseInt(process.env.PRICES_STALE_AFTER_DAYS ?? '', 10);

  return {
    // One month between refreshes by default.
    ttlMs: seconds('PRICES_TTL_SECONDS', 2_592_000, 60, 2_678_400),
    minRefreshMs: seconds('PRICES_MIN_REFRESH_SECONDS', 60, 5, 3600),
    intervalMs: seconds('PRICES_REFRESH_INTERVAL_SECONDS', 2_592_000, 60, 2_678_400),
    staleAfterDays: Number.isFinite(days) ? Math.min(365, Math.max(1, days)) : 3,
  };
}

const state = {
  snapshot: null,
  refreshing: null,
  lastCheckedAt: 0,
  lastSuccessAt: null,
  lastHttpStatus: null,
  lastError: null,
  failures: 0,
  checks: 0,
  unchangedChecks: 0,
  upstreamEtag: null,
  upstreamLastModified: null,
  // The hot path: fully serialised body, ETag and derived fields, built once
  // per refresh instead of once per request.
  published: null,
};

function hashMills(observedAt, mills) {
  const canonical = JSON.stringify({
    observedAt,
    mills: [...mills]
      .map((mill) => [mill.slug, mill.price])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function validateMills(mills) {
  const seen = new Set();
  const valid = [];
  let rejected = 0;

  for (const mill of mills) {
    const price = Number(mill.price);
    if (
      !mill.name ||
      !mill.slug ||
      !Number.isFinite(price) ||
      price < MIN_PRICE ||
      price > MAX_PRICE ||
      seen.has(mill.slug)
    ) {
      rejected += 1;
      continue;
    }
    seen.add(mill.slug);
    valid.push({ name: mill.name, slug: mill.slug, price, factoryId: mill.factoryId ?? null });
  }

  return { valid, rejected };
}

function ageInDays(isoDate, nowMs) {
  const date = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, Math.floor((nowMs - date) / DAY_MS));
}

function extractTickerText(html) {
  const text = htmlToText(html);
  const anchor = text.search(/Sugar\s+Prices\s+as\s+at/i);
  return anchor >= 0 ? text.slice(anchor, anchor + 2000) : '';
}

/**
 * @param {number} now
 * @returns {PricePayload}
 */
function buildPayload(now) {
  const cfg = config();
  const snapshot = state.snapshot ?? BUNDLED_SNAPSHOT;
  const ageDays = ageInDays(snapshot.observedAt, now);
  const staleByDate = ageDays !== null && ageDays > cfg.staleAfterDays;

  const data = snapshot.mills
    .map((mill) => ({
      mill_name: mill.name,
      mill_slug: mill.slug,
      price_kes_per_50kg: mill.price,
      price_kes_per_kg: Math.round((mill.price / 50) * 100) / 100,
      factory_id: mill.factoryId ?? null,
    }))
    .sort((a, b) => b.price_kes_per_50kg - a.price_kes_per_50kg || a.mill_name.localeCompare(b.mill_name));

  return {
    version: '1',
    source: {
      id: SOURCE_ID,
      name: SOURCE_NAME,
      url: SOURCE_URL,
      method: 'html-ticker',
      official_api: false,
    },
    unit: PRICE_UNIT,
    data_version: snapshot.contentHash,
    data_origin: snapshot.origin,
    observed_at: snapshot.observedAt,
    fetched_at: snapshot.fetchedAt,
    last_checked_at: state.lastCheckedAt ? new Date(state.lastCheckedAt).toISOString() : null,
    last_success_at: state.lastSuccessAt,
    age_days: ageDays,
    stale: Boolean(state.lastError) || staleByDate,
    stale_reason: state.lastError
      ? 'upstream_unavailable'
      : staleByDate
        ? `older_than_${cfg.staleAfterDays}_days`
        : null,
    mill_count: data.length,
    data,
    cache: {
      ttl_seconds: Math.round(cfg.ttlMs / 1000),
      min_refresh_seconds: Math.round(cfg.minRefreshMs / 1000),
      background_interval_seconds: Math.round(cfg.intervalMs / 1000),
      stale_after_days: cfg.staleAfterDays,
      checks: state.checks,
      unchanged_checks: state.unchangedChecks,
      failures: state.failures,
      last_http_status: state.lastHttpStatus,
      last_error: state.lastError,
    },
  };
}

function publish(now = Date.now()) {
  const payload = buildPayload(now);
  state.published = {
    payload,
    json: JSON.stringify(payload),
    etag: `W/"${createHash('sha256').update(payload.data_version).digest('hex').slice(0, 32)}"`,
    builtAt: now,
    staleAt:
      payload.age_days === null
        ? Number.POSITIVE_INFINITY
        : Date.parse(`${payload.observed_at}T00:00:00Z`) + (config().staleAfterDays + 1) * DAY_MS,
    stale: payload.stale,
  };
  return state.published;
}

/**
 * Refresh the cache at most once at a time (single-flight). Concurrent
 * requests share the same upstream fetch instead of stampeding KSB.
 */
export async function refreshPrices(options = {}) {
  const { force = false, fetchImpl, now = Date.now() } = options;

  if (state.refreshing) return state.refreshing;

  const cfg = config();
  if (!force && state.lastCheckedAt > 0 && now - state.lastCheckedAt < cfg.minRefreshMs) {
    return { skipped: true };
  }

  state.refreshing = runRefresh({ fetchImpl, now }).finally(() => {
    state.refreshing = null;
  });

  return state.refreshing;
}

async function runRefresh({ fetchImpl, now }) {
  state.checks += 1;

  try {
    const upstream = await fetchMiwaBoraHtml({
      ...(fetchImpl ? { fetchImpl } : {}),
      etag: state.upstreamEtag,
      lastModified: state.upstreamLastModified,
    });

    state.lastCheckedAt = now;
    state.lastHttpStatus = upstream.status;

    if (upstream.notModified) {
      state.lastSuccessAt = new Date(now).toISOString();
      state.lastError = null;
      state.unchangedChecks += 1;
      publish(now);
      return { notModified: true };
    }

    state.upstreamEtag = upstream.etag ?? null;
    state.upstreamLastModified = upstream.lastModified ?? null;

    const parsed = parseMiwaBoraHtml(upstream.html);
    const { valid, rejected } = validateMills(parsed.mills);

    if (valid.length < MIN_MILLS) {
      throw new PriceParseError(
        `Only ${valid.length} plausible mill prices after validation (${rejected} rejected).`,
        'implausible_prices',
      );
    }

    const contentHash = hashMills(parsed.observedAt, valid);

    if (state.snapshot?.contentHash === contentHash && state.snapshot.origin === 'miwabora') {
      state.lastSuccessAt = new Date(now).toISOString();
      state.lastError = null;
      state.failures = 0;
      state.unchangedChecks += 1;
      publish(now);
      return { unchanged: true, observedAt: parsed.observedAt, mills: valid.length };
    }

    state.snapshot = {
      origin: 'miwabora',
      observedAt: parsed.observedAt,
      fetchedAt: new Date(now).toISOString(),
      contentHash,
      mills: valid,
      tickerText: parsed.tickerText || extractTickerText(upstream.html),
    };
    state.lastSuccessAt = new Date(now).toISOString();
    state.lastError = null;
    state.failures = 0;
    publish(now);

    return {
      updated: true,
      observedAt: parsed.observedAt,
      mills: valid.length,
      rejected,
      strategy: parsed.strategy,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof PriceParseError
        ? error.code
        : error?.permanent
          ? 'upstream_rejected'
          : 'upstream_error';

    state.failures += 1;
    state.lastError = { code, message, at: new Date(now).toISOString() };

    // Retry after one minute rather than the full TTL, so a transient outage
    // does not leave the feed behind for a month.
    state.lastCheckedAt = now - (config().ttlMs - Math.min(config().ttlMs, 60_000));

    if (!state.snapshot) state.snapshot = BUNDLED_SNAPSHOT;
    publish(now);

    return { error: state.lastError };
  }
}

/**
 * Fast path used by the HTTP route: returns a pre-serialised body and ETag.
 * No allocation, no sort, no stringify per request unless the 3-day staleness
 * boundary has been crossed since the last build.
 */
/**
 * @param {{ now?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Published>}
 */
export async function getPublishedPrices(options = {}) {
  const { now = Date.now() } = options;
  const cfg = config();

  if (!state.snapshot) {
    await refreshPrices({ force: true, now, fetchImpl: options.fetchImpl });
  } else if (now - state.lastCheckedAt >= cfg.ttlMs) {
    // Stale-while-revalidate: answer instantly, refresh in the background.
    void refreshPrices({ now, fetchImpl: options.fetchImpl }).catch(() => {});
  }

  if (!state.published || (!state.published.stale && now >= state.published.staleAt)) {
    publish(now);
  }

  return state.published;
}

/**
 * Full payload for callers that want the object (tests, server code).
 * @param {{ now?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<PricePayload>}
 */
export async function getSugarPrices(options = {}) {
  return (await getPublishedPrices(options)).payload;
}

/** Test hook: clear module state so each case starts cold. */
export function __resetPriceCacheForTests() {
  state.snapshot = null;
  state.refreshing = null;
  state.lastCheckedAt = 0;
  state.lastSuccessAt = null;
  state.lastHttpStatus = null;
  state.lastError = null;
  state.failures = 0;
  state.checks = 0;
  state.unchangedChecks = 0;
  state.upstreamEtag = null;
  state.upstreamLastModified = null;
  state.published = null;
}

/**
 * Background polling for long-lived servers (next dev, a VPS, Docker).
 * On serverless hosts a timer cannot be relied on; there the TTL check on each
 * request is what refreshes the cache. Either way KSB is polled at most once
 * per PRICES_REFRESH_INTERVAL_SECONDS, and never per request.
 */
const globalFlags = globalThis;

/**
 * setTimeout cannot hold more than 2^31-1 ms (~24.8 days); passing a month
 * silently becomes a 1 ms loop. Long waits are therefore scheduled in chunks.
 */
function startPolling(intervalMs) {
  const MAX_DELAY = 2_147_483_647;
  let elapsed = 0;

  const schedule = () => {
    const delay = Math.min(MAX_DELAY, intervalMs - elapsed);
    const timer = setTimeout(() => {
      elapsed += delay;
      if (elapsed >= intervalMs) {
        elapsed = 0;
        refreshPrices().catch(() => {});
      }
      schedule();
    }, delay);
    timer.unref?.();
    globalFlags.__miwaSugarPriceTimer = timer;
  };

  schedule();
}

if (!globalFlags.__miwaSugarPriceTimer && process.env.NEXT_PHASE !== 'phase-production-build') {
  startPolling(config().intervalMs);
}
