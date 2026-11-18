/**
 * Gold-Vision API constants.
 *
 * The Gold-Vision REST API is instance-scoped: every customer has their own
 * subdomain.  The base URL is stored in credentials.extra.instanceUrl and
 * falls back to the hosted SaaS pattern below.
 *
 * Docs: https://help.gold-vision.com/gold-vision-api/
 */

/** Token endpoint — same for all Gold-Vision installations. */
export const GV_TOKEN_URL = 'https://uk.gold-vision.me/connect/token'

/**
 * Build the per-instance API base URL.
 *
 * @param instanceUrl - e.g. "https://mycompany.goldvisioncrm.com"  (no trailing slash)
 */
export function buildBaseUrl(instanceUrl: string): string {
  return `${instanceUrl.replace(/\/$/, '')}/api/cosmos`
}

/** OAuth2 scope required by Gold-Vision. */
export const GV_SCOPE = 'goldvisionapi'

/** Default number of records to request per page. */
export const DEFAULT_PAGE_SIZE = 25
