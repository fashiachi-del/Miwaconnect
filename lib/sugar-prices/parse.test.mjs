import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceParseError, htmlToText, parseMiwaBoraHtml, slugifyMill } from './parse.mjs';

const MILLS = [
  ['Butali Sugar', 5700],
  ['Nzoia Sugar', 5700],
  ['Soit Sugar', 5700],
  ['SONY Sugar', 5800],
  ['Chemelil Sugar', 5800],
  ['Mumias Sugar', 5900],
];

const SPAN_HTML = `<html><body>
  <div class="top-bar">
    <span class="fw-bold mx-1">Sugar Prices as at Mon, 23/Nov/2026: </span>
    ${MILLS.map(
      ([name, price]) =>
        `<span class="mx-1 fw-bold">${name}</span><span>-</span><span class="mx-1">${price},</span>`,
    ).join('\n    ')}
  </div>
  <h2>Discover Miwa Bora.</h2>
</body></html>`;

test('parses the live span layout', () => {
  const result = parseMiwaBoraHtml(SPAN_HTML);

  assert.equal(result.observedAt, '2026-11-23');
  assert.equal(result.mills.length, MILLS.length);
  assert.equal(result.strategy, 'text');

  const butali = result.mills.find((mill) => mill.slug === 'butali-sugar');
  assert.deepEqual(butali, {
    name: 'Butali Sugar',
    slug: 'butali-sugar',
    price: 5700,
    factoryId: 'FAC07',
  });

  const sony = result.mills.find((mill) => mill.slug === 'sony-sugar');
  assert.equal(sony.price, 5800);
  assert.equal(sony.factoryId, 'FAC05');
  assert.equal(result.tickerText.includes('Mumias Sugar'), true);
});

test('parses tag-stripped text (markup refactor tolerant)', () => {
  const flat = htmlToText(SPAN_HTML);
  const result = parseMiwaBoraHtml(`<pre>${flat}</pre>`);

  assert.equal(result.observedAt, '2026-11-23');
  assert.equal(result.mills.length, MILLS.length);
  assert.equal(result.mills[0].price, 5700);
});

test('handles thousands separators and alternate date formats', () => {
  const html = `<p>Sugar Prices as at 5 December 2026: Butali Sugar - KES 5,700, Nzoia Sugar - 5,800,
    Soit Sugar - 5,900, SONY Sugar - 6,000, Chemelil Sugar - 6,100, Mumias Sugar - 6,200</p>`;
  const result = parseMiwaBoraHtml(html);

  assert.equal(result.observedAt, '2026-12-05');
  assert.equal(result.mills.find((mill) => mill.slug === 'butali-sugar').price, 5700);
  assert.equal(result.mills.find((mill) => mill.slug === 'mumias-sugar').price, 6200);
});

const PAD = `<!-- ${'padding '.repeat(30)} -->`;

test('refuses to guess when the ticker disappears', () => {
  assert.throws(
    () => parseMiwaBoraHtml(`<html><body><p>Sugar prices will return soon.</p>${PAD}</body></html>`),
    (error) => error instanceof PriceParseError && error.code === 'ticker_missing',
  );
});

test('refuses to publish a partial parse', () => {
  const html = `<p>Sugar Prices as at Mon, 23/Nov/2026: Butali Sugar - 5700, Nzoia Sugar - 5800</p>${PAD}`;
  assert.throws(
    () => parseMiwaBoraHtml(html),
    (error) => error instanceof PriceParseError && error.code === 'too_few_mills',
  );
});

test('rejects impossible dates', () => {
  const html = `<p>Sugar Prices as at Mon, 32/Nov/2026: ${MILLS.map(([n, p]) => `${n} - ${p}`).join(', ')}</p>${PAD}`;
  assert.throws(
    () => parseMiwaBoraHtml(html),
    (error) => error instanceof PriceParseError && error.code === 'date_invalid',
  );
});

test('rejects empty payloads', () => {
  assert.throws(
    () => parseMiwaBoraHtml('<html></html>'),
    (error) => error instanceof PriceParseError && error.code === 'payload_too_small',
  );
});

test('slugify collapses punctuation predictably', () => {
  assert.equal(slugifyMill('SONY Sugar'), 'sony-sugar');
  assert.equal(slugifyMill('West Valley Sugar'), 'west-valley-sugar');
  assert.equal(slugifyMill('Kibos Sugar & Allied'), 'kibos-sugar-and-allied');
});
