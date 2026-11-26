import { SOURCE_URL } from './parse.mjs';

export const MAX_BYTES = 2_000_000;
const USER_AGENT =
  'MiwaConnectKenya/1.0 (sugarcane farmer price monitor; +https://miwaconnect.co.ke)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One polite request to Miwa Bora, with hard limits: a fixed URL (no user
 * input, so no SSRF), a timeout, a response size cap, conditional headers, and
 * bounded retries for transient failures only.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   retries?: number,
 *   url?: string,
 *   etag?: string | null,
 *   lastModified?: string | null,
 * }} [options]
 */
export async function fetchMiwaBoraHtml(options = {}) {
  const {
    fetchImpl = fetch,
    timeoutMs = 15_000,
    retries = 3,
    url = SOURCE_URL,
    etag = null,
    lastModified = null,
  } = options;

  const headers = {
    'user-agent': USER_AGENT,
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'en',
  };
  // The page currently sends neither, but honouring them costs nothing and
  // avoids a full download the day Cloudflare starts supporting them.
  if (etag) headers['if-none-match'] = etag;
  if (lastModified) headers['if-modified-since'] = lastModified;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      });

      const responseEtag = response.headers.get('etag');
      const responseLastModified = response.headers.get('last-modified');

      if (response.status === 304) {
        return {
          notModified: true,
          status: 304,
          url: response.url || url,
          etag: responseEtag ?? etag,
          lastModified: responseLastModified ?? lastModified,
          html: null,
        };
      }

      if (response.status >= 500 || response.status === 429) {
        throw new Error(`Upstream responded ${response.status}`);
      }
      if (!response.ok) {
        // A 4xx means the page moved or blocked us: retrying will not help.
        const error = new Error(`Upstream responded ${response.status} ${response.statusText}`);
        error.permanent = true;
        throw error;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        const error = new Error(`Unexpected content-type: "${contentType}"`);
        error.permanent = true;
        throw error;
      }

      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > MAX_BYTES) {
        const error = new Error(`Upstream declared ${declaredLength} bytes, above the cap`);
        error.permanent = true;
        throw error;
      }

      const html = await response.text();
      if (html.length > MAX_BYTES) throw new Error(`Response of ${html.length} bytes exceeds the cap`);

      return {
        notModified: false,
        status: response.status,
        url: response.url || url,
        etag: responseEtag,
        lastModified: responseLastModified,
        html,
      };
    } catch (error) {
      lastError = error;
      if (error?.permanent || attempt === retries) break;
      await sleep(attempt * 1500);
    }
  }

  throw new Error(
    `Could not fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
