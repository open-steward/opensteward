/**
 * Elastic Path Commerce Cloud constants.
 *
 * Elastic Path is a composable headless SaaS commerce platform with regional
 * API endpoints. Responses use a JSON:API-like envelope `{data, included, meta}`.
 * Pagination uses `page[offset]` + `page[limit]`.
 */

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/** OAuth2 client-credentials tokens expire in ~3600s; refresh 5 min early. */
export const TOKEN_LIFETIME_SECONDS = 3300

export const TOKEN_ENDPOINT = '/oauth/access_token'

export const CONTENT_TYPE = 'application/json'

/** Regional API base URLs. Default is US East. */
export const REGIONS: Record<string, string> = {
  'us-east': 'https://useast.api.elasticpath.com',
  'eu-west': 'https://euwest.api.elasticpath.com',
}

export const DEFAULT_REGION = 'us-east'
