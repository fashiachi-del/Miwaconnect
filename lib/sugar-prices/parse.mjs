/**
 * Parser for the Kenya Sugar Board (Miwa Bora) public price ticker.
 *
 * There is no official KSB API, so the ticker published at https://miwabora.go.ke/
 * is the source of truth. It is rendered server-side as a list of spans:
 *
 *   <span class="fw-bold mx-1">Sugar Prices as at Mon, 23/Nov/2026: </span>
 *   <span class="mx-1 fw-bold">Butali Sugar</span><span>-</span><span class="mx-1">5700,</span>
 *   ...
 *
 * The parser works on tag-stripped text first (so cosmetic markup changes do not
 * break it) and falls back to span pairs only if the text pass finds too few
 * mills. Anything unexpected raises a PriceParseError instead of returning
 * partial or invented data.
 */

export const SOURCE_ID = 'ksb-miwabora';
export const SOURCE_NAME = 'Kenya Sugar Board — Miwa Bora';
export const SOURCE_URL = 'https://miwabora.go.ke/';
export const PRICE_UNIT = 'KES per 50kg bag';

const MIN_MILLS = 5;
const MAX_MILLS = 60;
const ANCHOR = /Sugar\s+Prices\s+as\s+at\s*([^:]{3,60}?)\s*:/i;
const TICKER_END = /Discover\s+Miwa\s+Bora|News\s+Feed|All\s+Industry\s+News/i;

const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/** Mills sharing a name with a factory in our own table can be linked safely. */
const FACTORY_BY_SLUG = {
  'butali-sugar': 'FAC07',
  'nzoia-sugar': 'FAC02',
  'sony-sugar': 'FAC05',
  'chemelil-sugar': 'FAC03',
  'muhoroni-sugar': 'FAC04',
  'mumias-sugar': 'FAC01',
};

export class PriceParseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PriceParseError';
    this.code = code;
  }
}

export function slugifyMill(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

export function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseObservedDate(raw) {
  const value = String(raw).replace(/\s+/g, ' ').trim();

  const numeric = value.match(/(\d{1,2})\s*[/\-.]\s*([A-Za-z]{3,9})\s*[/\-.]\s*(\d{4})/);
  const words = value.match(/(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/);
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);

  let day;
  let month;
  let year;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else if (numeric) {
    day = Number(numeric[1]);
    month = MONTHS[numeric[2].toLowerCase()];
    year = Number(numeric[3]);
  } else if (words) {
    day = Number(words[1]);
    month = MONTHS[words[2].toLowerCase()];
    year = Number(words[3]);
  } else {
    throw new PriceParseError(
      `Could not read the "Sugar Prices as at ..." date from: "${value}"`,
      'date_missing',
    );
  }

  const date = new Date(Date.UTC(year, month, day));
  if (
    !Number.isFinite(month) ||
    year < 2015 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    throw new PriceParseError(`Implausible price date: "${value}"`, 'date_invalid');
  }

  return date.toISOString().slice(0, 10);
}

const ENTRY =
  /^\s*([A-Za-z][A-Za-z0-9 .&'()/-]{2,45}?)\s*[-\u2013\u2014:]\s*(?:KES|KShs?\.?)?\s*([0-9][0-9,]{2,9})\s*\.?\s*$/i;

function parseEntry(part) {
  const match = String(part).replace(/\u00a0/g, ' ').match(ENTRY);
  if (!match) return null;

  const name = match[1].replace(/\s+/g, ' ').trim();
  const price = Number(match[2].replace(/,/g, ''));

  if (!name || !Number.isFinite(price)) return null;

  const slug = slugifyMill(name);
  if (!slug) return null;

  return { name, slug, price, factoryId: FACTORY_BY_SLUG[slug] ?? null };
}

function dedupe(mills) {
  const bySlug = new Map();
  for (const mill of mills) if (!bySlug.has(mill.slug)) bySlug.set(mill.slug, mill);
  return [...bySlug.values()];
}

/** Fallback for when text extraction yields too little: read the span pairs directly. */
function parseSpanPairs(html) {
  const pattern =
    /<span[^>]*class="[^"]*fw-bold[^"]*"[^>]*>([^<]{2,60})<\/span>\s*<span>\s*[-\u2013\u2014]\s*<\/span>\s*<span[^>]*>([^<]{1,20})<\/span>/gi;
  const mills = [];
  for (const match of String(html).matchAll(pattern)) {
    const mill = parseEntry(`${decodeEntities(match[1])}-${decodeEntities(match[2])}`);
    if (mill) mills.push(mill);
  }
  return dedupe(mills);
}

/**
 * @param {string} html
 * @returns {{observedAt: string, mills: Array<{name: string, slug: string, price: number, factoryId: string | null}>, tickerText: string, strategy: 'text' | 'spans'}}
 */
export function parseMiwaBoraHtml(html) {
  if (typeof html !== 'string' || html.length < 100) {
    throw new PriceParseError('Upstream response was empty or far too short.', 'payload_too_small');
  }
  if (html.length > 2_000_000) {
    throw new PriceParseError('Upstream response exceeded the size limit.', 'payload_too_large');
  }

  const text = htmlToText(html);
  const anchor = text.match(ANCHOR);
  if (!anchor) {
    throw new PriceParseError(
      'The "Sugar Prices as at ..." ticker is no longer present on miwabora.go.ke.',
      'ticker_missing',
    );
  }

  const observedAt = parseObservedDate(anchor[1]);

  const start = (anchor.index ?? 0) + anchor[0].length;
  const rest = text.slice(start);
  const end = rest.search(TICKER_END);
  const block = (end > 0 ? rest.slice(0, end) : rest.slice(0, 2000)).trim();

  // Split on entry boundaries only: a comma followed by a mill name. Splitting
  // on every comma would tear "5,700" into two tokens.
  let mills = dedupe(
    block
      .split(/,(?=\s*[A-Za-z])/)
      .map(parseEntry)
      .filter((mill) => mill !== null),
  );
  let strategy = 'text';

  if (mills.length < MIN_MILLS) {
    const fromSpans = parseSpanPairs(html);
    if (fromSpans.length > mills.length) {
      mills = fromSpans;
      strategy = 'spans';
    }
  }

  if (mills.length < MIN_MILLS) {
    throw new PriceParseError(
      `Only ${mills.length} mill prices were parsed; refusing to publish what looks like a layout change.`,
      'too_few_mills',
    );
  }
  if (mills.length > MAX_MILLS) {
    throw new PriceParseError(
      `Parsed ${mills.length} mills, more than the expected maximum of ${MAX_MILLS}.`,
      'too_many_mills',
    );
  }

  return { observedAt, mills, tickerText: block.slice(0, 4000), strategy };
}
