import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetPriceCacheForTests, getPublishedPrices, getSugarPrices, refreshPrices } from './cache.mjs';

const MILLS = [
  ['Butali Sugar', 5700],
  ['Nzoia Sugar', 5700],
  ['Soit Sugar', 5700],
  ['SONY Sugar', 5800],
  ['Chemelil Sugar', 5800],
  ['Mumias Sugar', 5900],
];

function tickerHtml(observed = 'Mon, 23/Nov/2026') {
  return `<html><body>
    <span class="fw-bold mx-1">Sugar Prices as at ${observed}: </span>
    ${MILLS.map(
      ([name, price]) =>
        `<span class="mx-1 fw-bold">${name}</span><span>-</span><span class="mx-1">${price},</span>`,
    ).join('')}
  </body></html>`;
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function countingFetch(html) {
  const calls = { count: 0 };
  const fetchImpl = async () => {
    calls.count += 1;
    return htmlResponse(html);
  };
  return { calls, fetchImpl };
}

beforeEach(() => {
  __resetPriceCacheForTests();
});

test('cold start fetches once and serves parsed prices', async () => {
  const { calls, fetchImpl } = countingFetch(tickerHtml());

  const payload = await getSugarPrices({ fetchImpl });

  assert.equal(calls.count, 1);
  assert.equal(payload.data_origin, 'miwabora');
  assert.equal(payload.observed_at, '2026-11-23');
  assert.equal(payload.mill_count, MILLS.length);
  assert.equal(payload.stale, false);
  assert.equal(payload.data[0].price_kes_per_50kg, 5900);
  assert.equal(payload.data[0].price_kes_per_kg, 118);
  assert.match(payload.data_version, /^[a-f0-9]{64}$/);
});

test('warm requests are served from memory without touching upstream', async () => {
  const { calls, fetchImpl } = countingFetch(tickerHtml());

  await getSugarPrices({ fetchImpl });
  await getSugarPrices({ fetchImpl });
  await getSugarPrices({ fetchImpl });

  assert.equal(calls.count, 1);
});

test('concurrent refreshes are single-flight', async () => {
  const { calls, fetchImpl } = countingFetch(tickerHtml());

  const [a, b] = await Promise.all([
    refreshPrices({ force: true, fetchImpl }),
    refreshPrices({ force: true, fetchImpl }),
  ]);

  assert.equal(calls.count, 1);
  assert.equal(a.updated, true);
  assert.equal(b.updated, true);
});

test('an unchanged ticker does not replace the snapshot', async () => {
  const { fetchImpl } = countingFetch(tickerHtml());

  const first = await getSugarPrices({ fetchImpl });
  const refreshed = await refreshPrices({ force: true, fetchImpl });
  const second = await getSugarPrices({ fetchImpl });

  assert.equal(refreshed.unchanged, true);
  assert.equal(second.fetched_at, first.fetched_at);
  assert.equal(second.data_version, first.data_version);
  assert.equal(second.cache.unchanged_checks >= 1, true);
});

test('a changed price produces a new version', async () => {
  const first = countingFetch(tickerHtml());
  const firstPayload = await getSugarPrices({ fetchImpl: first.fetchImpl });

  const changedHtml = tickerHtml('Tue, 24/Nov/2026').replace('5700', '5600');
  const second = countingFetch(changedHtml);
  const refreshed = await refreshPrices({ force: true, fetchImpl: second.fetchImpl });
  const secondPayload = await getSugarPrices({ fetchImpl: second.fetchImpl });

  assert.equal(refreshed.updated, true);
  assert.equal(secondPayload.observed_at, '2026-11-24');
  assert.notEqual(secondPayload.data_version, firstPayload.data_version);
  assert.equal(secondPayload.data.find((row) => row.mill_slug === 'butali-sugar').price_kes_per_50kg, 5600);
});

test('upstream failure keeps the last good data and marks it stale', async () => {
  const { fetchImpl } = countingFetch(tickerHtml());
  await getSugarPrices({ fetchImpl });

  const failing = async () => new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } });
  await refreshPrices({ force: true, fetchImpl: failing });

  const payload = await getSugarPrices({ fetchImpl: failing });

  assert.equal(payload.data_origin, 'miwabora');
  assert.equal(payload.mill_count, MILLS.length);
  assert.equal(payload.stale, true);
  assert.equal(payload.stale_reason, 'upstream_unavailable');
  assert.equal(payload.cache.failures, 1);
  assert.match(payload.cache.last_error.message, /404/);
});

test('publishes a pre-serialised body and ETag once per refresh', async () => {
  const { calls, fetchImpl } = countingFetch(tickerHtml());
  const published = await getPublishedPrices({ fetchImpl });

  assert.equal(JSON.parse(published.json).mill_count, MILLS.length);
  assert.equal(published.payload.cache.ttl_seconds, 2_592_000);
  assert.match(published.etag, /^W\/"[a-f0-9]{32}"$/);

  const again = await getPublishedPrices({ fetchImpl });
  assert.equal(again.etag, published.etag);
  assert.equal(calls.count, 1);
});

test('cold-start failure serves the bundled snapshot, clearly flagged', async () => {
  const failing = async () => new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } });

  await refreshPrices({ force: true, fetchImpl: failing });
  const payload = await getSugarPrices({ fetchImpl: failing });

  assert.equal(payload.data_origin, 'bundled-snapshot');
  assert.equal(payload.stale, true);
  assert.equal(payload.observed_at, '2026-11-23');
  assert.equal(payload.mill_count, 15);
  assert.ok(payload.data.every((row) => row.price_kes_per_50kg >= 3000));
});
