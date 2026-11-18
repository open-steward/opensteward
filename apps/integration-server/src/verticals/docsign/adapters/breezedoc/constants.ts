/**
 * BreezeDoc REST API constants.
 *
 * BreezeDoc exposes a single hosted environment (no separate sandbox host).
 * All resource paths nest under `https://breezedoc.com/api`. Requests
 * authenticate with a Personal Access Token in the `Authorization: Bearer`
 * header; the token is minted at https://breezedoc.com/integrations/api.
 *
 * Docs: https://breezedoc.com/developer/docs/
 */

/** Base URL for all BreezeDoc REST calls. */
export const API_BASE_URL = 'https://breezedoc.com/api'

/** Where customers mint their Personal Access Token. */
export const API_TOKEN_SETTINGS_URL = 'https://breezedoc.com/integrations/api'

/**
 * BreezeDoc list endpoints return a Laravel-style paginator. There is no
 * client-controllable page-size parameter documented — the server fixes
 * `per_page`. We surface the requested page via `params.page`.
 */
export const DEFAULT_PAGE = 1
