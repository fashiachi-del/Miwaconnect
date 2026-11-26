# Sugar Prices API (Kenya Sugar Board / Miwa Bora)

A read-only JSON feed of Kenyan ex-factory sugar prices, scraped politely from the
Kenya Sugar Board's public Miwa Bora ticker and served from an in-memory cache.

- **Endpoint:** `GET /api/sugar-prices`
- **Auth:** optional API key (`PRICES_API_KEY`)
- **Storage:** none — no database writes, no historical retention
- **Upstream calls:** at most one per TTL window (**default 30 days**), never per request

> **Unit warning.** Miwa Bora publishes **ex-factory sugar prices in KES per 50 kg
> bag**. These are *not* the cane prices per tonne that MiwaConnect stores on
> `factories`. The API never writes to `factories`; the two datasets are separate.

---

## 1. Why scraping, and what happens when KSB changes the page

KSB has no public API (as of November 2026; `info@ksb.go.ke` / +254 722 203 127 is
the route to request one). The ticker is server-rendered HTML:

```html
<span class="fw-bold mx-1">Sugar Prices as at Mon, 23/Nov/2026: </span>
<span class="mx-1 fw-bold">Butali Sugar</span><span>-</span><span class="mx-1">5700,</span>
...
```

The parser (`lib/sugar-prices/parse.mjs`):

1. strips tags and reads the text, so cosmetic markup changes are ignored;
2. falls back to reading the span pairs if the text pass finds too few mills;
3. refuses the whole payload (and keeps the previous data) if:
   - the `Sugar Prices as at …` anchor is missing (`ticker_missing`),
   - the date is unreadable or impossible (`date_invalid`),
   - fewer than 5 mills parse (`too_few_mills`),
   - more than 60 mills parse (`too_many_mills`),
   - prices fall outside KES 3,000–15,000 per bag (`implausible_prices`).

A layout change therefore shows up as `stale: true` + an explicit error in the
response, not as wrong prices.

---

## 2. Request

```
GET /api/sugar-prices
GET /api/sugar-prices?mill=butali-sugar
GET /api/sugar-prices?factory_id=FAC02
```

| Query param | Type | Notes |
| --- | --- | --- |
| `mill` | string | Mill slug, e.g. `butali-sugar`, `sony-sugar` |
| `factory_id` | string | MiwaConnect factory ID (`FAC01`–`FAC10`), only set where the mill name maps unambiguously |

Unknown filters return `200` with `data: []`; they are not errors.

### Authentication

Set `PRICES_API_KEY` in the environment to require a key:

```bash
curl -H "x-api-key: $PRICES_API_KEY" https://your-app/api/sugar-prices
# or
curl -H "Authorization: Bearer $PRICES_API_KEY" https://your-app/api/sugar-prices
```

If `PRICES_API_KEY` is unset the endpoint is public (public data) and cacheable by
the CDN. When the key is set, responses switch to `Cache-Control: private` and
`Vary: x-api-key, authorization` so a shared cache cannot leak responses.

---

## 3. Response

```json
{
  "version": "1",
  "source": {
    "id": "ksb-miwabora",
    "name": "Kenya Sugar Board — Miwa Bora",
    "url": "https://miwabora.go.ke/",
    "method": "html-ticker",
    "official_api": false
  },
  "unit": "KES per 50kg bag",
  "data_version": "9f2c…",
  "data_origin": "miwabora",
  "observed_at": "2026-11-23",
  "fetched_at": "2026-11-26T19:12:44.019Z",
  "last_checked_at": "2026-11-26T19:17:02.113Z",
  "last_success_at": "2026-11-26T19:12:44.019Z",
  "age_days": 3,
  "stale": false,
  "stale_reason": null,
  "mill_count": 15,
  "data": [
    {
      "mill_name": "Mumias Sugar",
      "mill_slug": "mumias-sugar",
      "price_kes_per_50kg": 5900,
      "price_kes_per_kg": 118,
      "factory_id": "FAC01"
    }
  ],
  "cache": {
    "ttl_seconds": 2592000,
    "min_refresh_seconds": 60,
    "background_interval_seconds": 2592000,
    "stale_after_days": 3,
    "checks": 41,
    "unchanged_checks": 33,
    "failures": 0,
    "last_http_status": 200,
    "last_error": null
  }
}
```

| Field | Meaning |
| --- | --- |
| `data_version` | Hash of the parsed prices only; stable while prices are unchanged. Also the basis of the response `ETag`. |
| `data_origin` | `miwabora` for a live parse, `bundled-snapshot` for the emergency copy |
| `observed_at` | Trading date printed by KSB, not the time we fetched |
| `fetched_at` | When this price set was first seen (`null` for the bundled snapshot) |
| `last_checked_at` | Last upstream check, successful or not |
| `age_days` | Age of `observed_at` in whole days |
| `stale` | `true` after a failed check, or when the ticker is older than 3 days |
| `stale_reason` | `upstream_unavailable`, `older_than_three_days`, or `null` |
| `price_kes_per_kg` | Convenience conversion (`price / 50`) |
| `factory_id` | Set only for exact mill↔factory name matches; `null` otherwise |
| `cache.last_error` | `{ code, message, at }` from the last failed attempt |

### Headers

| Header | Value |
| --- | --- |
| `ETag` | `W/"…"` derived from `data_version` + filters; send `If-None-Match` to get `304` |
| `Cache-Control` | `public, max-age=60, s-maxage=<min(ttl, 1h)>, stale-while-revalidate=86400` (or `private` with a key) |
| `X-Data-Origin` | `miwabora` / `bundled-snapshot` |
| `X-Observed-At` | `YYYY-MM-DD` |
| `X-Prices-Stale` | `true` / `false` |

Conditional request:

```bash
etag=$(curl -sI https://your-app/api/sugar-prices | awk -F': ' '/^etag/{print $2}' | tr -d '\r')
curl -s -o /dev/null -w "%{http_code}\n" -H "If-None-Match: $etag" https://your-app/api/sugar-prices
# 304
```

### Errors

| Status | Code | When |
| --- | --- | --- |
| `401` | `unauthorized` | `PRICES_API_KEY` set and the key is missing/wrong |
| `503` | `prices_unavailable` | Only if the handler itself fails; upstream problems normally surface as `200` + `stale: true` |

---

## 4. Refresh behaviour (no database)

```
request ──► cache hit (age < TTL) ──► instant response
               │
               ├─ age ≥ TTL ──► respond now, refresh in background
               └─ empty cache ──► one awaited fetch (single-flight)
```

- **TTL:** `PRICES_TTL_SECONDS` (default `2592000` = 30 days, clamped 60 s–31 days).
- **Hard floor between checks:** `PRICES_MIN_REFRESH_SECONDS` (default `60`), so
  traffic spikes cannot hammer KSB.
- **Background poller:** `PRICES_REFRESH_INTERVAL_SECONDS` (default `2592000`) for
  long-lived servers (`next dev`, VPS, Docker). Timers do not run on serverless;
  there the TTL check on each request is the refresh trigger. Waits longer than
  2^31−1 ms are scheduled in chunks, because `setTimeout` would otherwise fire
  immediately.
- **Manual refresh:** `POST /api/sugar-prices/refresh` with
  `x-refresh-token: $PRICES_REFRESH_TOKEN` (disabled unless that variable is set).
- **Single-flight:** concurrent requests share one upstream fetch
  (`state.refreshing`), so 1,000 simultaneous requests produce one download.
- **Idempotency:** the ticker text is hashed (`data_version`). An unchanged page
  does not replace the snapshot, `fetched_at` does not move, and the API `ETag`
  stays the same — clients get `304`s for free.
- **Failure handling:** the last good snapshot stays in memory and is served with
  `stale: true`; the next retry happens after 60 s, not a whole TTL.
- **Cold start:** one fetch (≈34 KB). If it fails, the bundled snapshot in
  `lib/sugar-prices/fallback.mjs` is served, flagged `bundled-snapshot` + `stale`.

Because there is no database, a restart loses the in-memory copy. That is
deliberate: the upstream page is the source of truth and repopulating costs one
request, while the bundled snapshot covers the case where upstream is also down.

### Hot path (why it is fast)

- The response body is serialised **once per refresh**, not once per request:
  `getPublishedPrices()` hands the route a ready JSON string plus ETag.
- No database, no upstream call, no sort/format work on a warm request.
- `ETag` + `304` means clients and the CDN transfer nothing at all while the
  prices are unchanged.
- Single-flight plus the 60 s floor: 10,000 simultaneous requests cause at most
  one download.
- The only per-request work is two header lookups and, when `mill` / `factory_id`
  is used, a single array pass over ≤60 rows.

---

## 5. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRICES_API_KEY` | unset (public) | Require `x-api-key` / Bearer on the read endpoint |
| `PRICES_REFRESH_TOKEN` | unset (disabled) | Enables `POST /api/sugar-prices/refresh` |
| `PRICES_TTL_SECONDS` | `2592000` (30 days) | How long a snapshot is considered fresh |
| `PRICES_MIN_REFRESH_SECONDS` | `60` | Minimum gap between upstream checks |
| `PRICES_REFRESH_INTERVAL_SECONDS` | `2592000` | Background poll interval on long-lived servers |
| `PRICES_STALE_AFTER_DAYS` | `3` | Age at which `stale` flips to `true` |

> **Monthly polling is a deliberate trade.** KSB publishes a new ticker most
> working days, so with the 30-day default the feed will flag `stale: true` from
> day 4 until the next poll. Either raise `PRICES_STALE_AFTER_DAYS`, call the
> refresh endpoint after a price change, or lower `PRICES_TTL_SECONDS`.

No cron job, queue or database table is required.

---

## 6. Operating notes

- **Politeness:** one request per interval, fixed URL, `MiwaConnectKenya/1.0`
  user agent, 15 s timeout, 2 MB cap, retries only on 5xx/429 (max 3, backoff).
- **Legal:** the ticker is public government data; keep the request rate low and
  attribute KSB. Scraping is a bridge — request official API access from KSB
  (`info@ksb.go.ke`, +254 722 203 127) and from Kulea for market context.
- **Migration path:** when KSB provides an API, replace `fetchMiwaBoraHtml` +
  `parseMiwaBoraHtml` with a JSON adapter that returns the same
  `{ observedAt, mills[] }` shape. The cache, route, contract and docs stay.
- **Mill name changes:** add the new slug to `FACTORY_BY_SLUG` in `parse.mjs` only
  when it is unambiguously the same factory; otherwise leave `factory_id: null`.

## 7. Quick checks

```bash
npm run prices:test                       # parser + cache unit tests
curl -s localhost:3000/api/sugar-prices | head
curl -s "localhost:3000/api/sugar-prices?factory_id=FAC02"
curl -s -X POST -H "x-refresh-token: $PRICES_REFRESH_TOKEN" \
  localhost:3000/api/sugar-prices/refresh
```
