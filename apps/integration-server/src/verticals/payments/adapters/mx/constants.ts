/**
 * https://docs.mx.com/openapi/platform-api/v20250224.yaml
 *
 * `servers: - url: https://int-api.mx.com - url: https://api.mx.com` (the
 * spec gives the two hosts no descriptions). The adapter keeps its existing
 * host, `https://api.mx.com`, which the spec lists; it has no environment key
 * to select the other one.
 */
export const API_BASE_URL = 'https://api.mx.com'

/**
 * "Versions are set in the `Accept-Version` header of API requests." The
 * `acceptVersion` parameter is `required: true` with `default: v20250224`.
 */
export const API_VERSION = 'v20250224'

/**
 * `records_per_page` (recordsPerPageMax1000): "Defaults to `25`. The valid
 * range is from `10` to `1000`. If the value exceeds `1000`, the default value
 * of `25` will be used instead."
 */
export const DEFAULT_PAGE_SIZE = 25
export const MIN_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 1000
