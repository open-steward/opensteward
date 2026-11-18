/**
 * Nova Poshta API constants.
 *
 * Production base URL:  https://api.novapost.com/v.1.0/
 * Sandbox base URL:     https://api-stage.novapost.com/v.1.0/
 *
 * Auth: Exchange API key for a short-lived JWT via
 *   GET /clients/authorization?apiKey={apiKey}
 * The JWT is valid for ~1 hour and must be passed as
 *   Authorization: <jwt>
 */
export const NOVA_POSHTA_API_BASE = 'https://api.novapost.com/v.1.0/'

/** URL where users can obtain their Nova Poshta API key. */
export const NOVA_POSHTA_DASHBOARD_URL =
  'https://api-portal.novapost.com/'

/** Nova Poshta carrier identifier (used as carrierId in transforms). */
export const NOVA_POSHTA_CARRIER_ID = 'nova-poshta'

/** Default pagination page size. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size accepted by Nova Poshta. */
export const MAX_PAGE_SIZE = 100
