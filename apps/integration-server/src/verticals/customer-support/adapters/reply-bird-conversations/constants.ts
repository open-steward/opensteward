/**
 * Bird API constants, from https://bird.com/docs/guides/authentication,
 * https://bird.com/docs/api/pagination and https://bird.com/openapi.json.
 *
 * "The region in the key prefix tells you which host to call: `bk_us1_...`
 *  keys go to `https://us1.platform.bird.com`, `bk_eu1_...` keys to
 *  `https://eu1.platform.bird.com`."
 *
 * The spec's server is `https://{region}.platform.bird.com` with
 * `"region": { "default": "us1", "enum": ["us1", "eu1"] }`.
 */
export const API_KEY_PATTERN = /^bk_(us1|eu1)_/

/** The spec's documented default region, used when a key carries no region prefix. */
const DEFAULT_REGION = 'us1'

/** The regional API host a `bk_{region}_` key is served from. */
export function apiBaseUrl(apiKey: string): string {
  const region = API_KEY_PATTERN.exec(apiKey)?.[1] ?? DEFAULT_REGION
  return `https://${region}.platform.bird.com`
}

/** Pagination guide: "`limit` | integer | Maximum items per page. Between `1` and `100`; defaults to `25`." */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25
