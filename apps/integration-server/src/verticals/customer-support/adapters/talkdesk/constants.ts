/**
 * Talkdesk REST API constants.
 *
 * Talkdesk is multi-region; the region is stored in credentials.extra.region
 * and defaults to 'us'.
 *
 * REST API base URLs (used for all resource endpoints):
 *   US:     https://api.talkdeskapp.com
 *   EU:     https://api.talkdeskapp.eu
 *   Canada: https://api.talkdeskappca.com
 *   UK:     https://api.talkdeskapp.co.uk
 *
 * OAuth token/authorize URLs (account-scoped identity service):
 *   US:     https://{accountName}.talkdeskid.com
 *   EU:     https://{accountName}.talkdeskid.eu
 *   Canada: https://{accountName}.talkdeskidca.com
 *
 * Reference: https://docs.talkdesk.com/docs/how-to-guarantee-your-app-works-in-all-regions
 */

export const API_BASE_URL_BY_REGION: Record<string, string> = {
  us: 'https://api.talkdeskapp.com',
  eu: 'https://api.talkdeskapp.eu',
  ca: 'https://api.talkdeskappca.com',
  uk: 'https://api.talkdeskapp.co.uk',
}

/**
 * Identity service base domain suffix by region (prepend {accountName}.).
 * Talkdesk documents a UK API host but no UK identity host, so there is no
 * `uk` entry: a region without one cannot be authorized against.
 */
export const OAUTH_DOMAIN_BY_REGION: Record<string, string> = {
  us: 'talkdeskid.com',
  eu: 'talkdeskid.eu',
  ca: 'talkdeskidca.com',
}

export const DEFAULT_REGION = 'us'
export const DEFAULT_API_BASE_URL = API_BASE_URL_BY_REGION[DEFAULT_REGION]!

export const OAUTH_TOKEN_PATH = '/oauth/token'
export const OAUTH_AUTHORIZE_PATH = '/oauth/authorize'

/**
 * Build the region-aware OAuth token URL for a given account name.
 * e.g. https://{accountName}.talkdeskid.com/oauth/token
 */
export function buildTokenUrl(accountName: string, region: string = DEFAULT_REGION): string {
  const domain = OAUTH_DOMAIN_BY_REGION[region] ?? OAUTH_DOMAIN_BY_REGION[DEFAULT_REGION]!
  return `https://${accountName}.${domain}${OAUTH_TOKEN_PATH}`
}

/**
 * Build the region-aware OAuth authorize URL for a given account name.
 * e.g. https://{accountName}.talkdeskid.com/oauth/authorize
 */
export function buildAuthorizeUrl(accountName: string, region: string = DEFAULT_REGION): string {
  const domain = OAUTH_DOMAIN_BY_REGION[region] ?? OAUTH_DOMAIN_BY_REGION[DEFAULT_REGION]!
  return `https://${accountName}.${domain}${OAUTH_AUTHORIZE_PATH}`
}

/** Default page size for list endpoints (max 100). */
export const DEFAULT_PAGE_SIZE = 50

/** Default OAuth2 scopes requested (read-only). */
export const DEFAULT_SCOPES = [
  'contacts:read',
  'cases:read',
  'users:read',
  'teams:read',
  'webhooks:read',
]
