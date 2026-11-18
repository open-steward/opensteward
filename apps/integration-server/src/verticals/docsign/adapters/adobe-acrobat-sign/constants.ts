/**
 * Adobe Acrobat Sign REST API constants.
 *
 * Adobe Sign shards accounts across regional API hosts (na1, na2, eu1,
 * eu2, jp1, …). The per-account API access point comes back from
 * `GET /baseUris` after the first authenticated call; the OAuth host is
 * fixed below.
 *
 * Docs: https://developer.adobe.com/document-services/docs/overview/sign-api/
 */
export const API_VERSION = 'v6'

export const OAUTH_AUTHORIZE_URL = 'https://secure.na1.adobesign.com/public/oauth/v2'
export const OAUTH_TOKEN_URL = 'https://secure.na1.adobesign.com/oauth/v2/token'
export const OAUTH_REFRESH_URL = 'https://secure.na1.adobesign.com/oauth/v2/refresh'

export const DEFAULT_BASE_URI = 'https://api.na1.adobesign.com'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES = [
  'agreement_read:account',
  'agreement_write:account',
  'agreement_send:account',
  'library_read:account',
  'user_read:account',
]
