/**
 * Last-resort snapshot, captured from https://miwabora.go.ke/ on 2026-11-26.
 *
 * It is ONLY used when the process has never completed a successful fetch
 * (for example a cold start while KSB is unreachable). Every response built
 * from it is flagged `data_origin: "bundled-snapshot"` and `stale: true`, so
 * nobody mistakes it for a live quote.
 */
export const BUNDLED_SNAPSHOT = Object.freeze({
  origin: 'bundled-snapshot',
  observedAt: '2026-11-23',
  fetchedAt: null,
  contentHash: 'bundled-2026-11-23',
  mills: Object.freeze([
    { name: 'Butali Sugar', slug: 'butali-sugar', price: 5700, factoryId: 'FAC07' },
    { name: 'Nzoia Sugar', slug: 'nzoia-sugar', price: 5700, factoryId: 'FAC02' },
    { name: 'Soit Sugar', slug: 'soit-sugar', price: 5700, factoryId: null },
    { name: 'SONY Sugar', slug: 'sony-sugar', price: 5800, factoryId: 'FAC05' },
    { name: 'Chemelil Sugar', slug: 'chemelil-sugar', price: 5800, factoryId: 'FAC03' },
    { name: 'Naitiri Sugar', slug: 'naitiri-sugar', price: 5800, factoryId: null },
    { name: 'Kabras Sugar', slug: 'kabras-sugar', price: 5800, factoryId: null },
    { name: 'Star Sugar', slug: 'star-sugar', price: 5800, factoryId: null },
    { name: 'Olepito Sugar', slug: 'olepito-sugar', price: 5800, factoryId: null },
    { name: 'Ndhiwa Sugar', slug: 'ndhiwa-sugar', price: 5800, factoryId: null },
    { name: 'Muhoroni Sugar', slug: 'muhoroni-sugar', price: 5800, factoryId: 'FAC04' },
    { name: 'West Valley Sugar', slug: 'west-valley-sugar', price: 5900, factoryId: null },
    { name: 'Mara Sugar', slug: 'mara-sugar', price: 5900, factoryId: null },
    { name: 'Mumias Sugar', slug: 'mumias-sugar', price: 5900, factoryId: 'FAC01' },
    { name: 'Angata Sugar', slug: 'angata-sugar', price: 5900, factoryId: null },
  ]),
});
