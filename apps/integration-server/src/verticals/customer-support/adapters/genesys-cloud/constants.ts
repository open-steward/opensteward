/**
 * Genesys Cloud CX API constants.
 *
 * Base URL is region-specific. The default region host is api.mypurecloud.com
 * (US East). Customers provide their region via credentials.extra.region which
 * maps to the regional hostname, e.g.:
 *   us-east-1  -> api.mypurecloud.com
 *   us-west-2  -> api.usw2.pure.cloud
 *   eu-west-1  -> api.mypurecloud.ie
 *   ap-southeast-2 -> api.mypurecloud.com.au
 *
 * OAuth endpoints use the corresponding login.* host.
 *
 * Docs: https://developer.genesys.cloud/platform/api/
 */

export const DEFAULT_REGION = 'mypurecloud.com'

export const API_BASE_URL_TEMPLATE = 'https://api.{region}/api/v2'
export const OAUTH_AUTHORIZE_URL_TEMPLATE = 'https://login.{region}/oauth/authorize'
export const OAUTH_TOKEN_URL_TEMPLATE = 'https://login.{region}/oauth/token'

/**
 * AWS region code → host suffix (login.{suffix} / api.{suffix}).
 * The launch regions kept per-country domains; every region added later is
 * `{code}.pure.cloud` only — `usw2.mypurecloud.com` does not resolve.
 * Source: https://help.genesys.cloud/articles/aws-regions-for-genesys-cloud-deployment/
 */
export const REGION_MAP: Record<string, string> = {
  'us-east-1':      'mypurecloud.com',
  'us-east-2':      'use2.us-gov-pure.cloud',
  'us-west-2':      'usw2.pure.cloud',
  'ca-central-1':   'cac1.pure.cloud',
  'sa-east-1':      'sae1.pure.cloud',
  'mx-central-1':   'mxc1.pure.cloud',
  'eu-west-1':      'mypurecloud.ie',
  'eu-west-2':      'euw2.pure.cloud',
  'eu-central-1':   'mypurecloud.de',
  'eu-central-2':   'euc2.pure.cloud',
  'me-central-1':   'mec1.pure.cloud',
  'ap-south-1':     'aps1.pure.cloud',
  'ap-northeast-1': 'mypurecloud.jp',
  'ap-northeast-2': 'apne2.pure.cloud',
  'ap-northeast-3': 'apne3.pure.cloud',
  'ap-southeast-1': 'apse1.pure.cloud',
  'ap-southeast-2': 'mypurecloud.com.au',
}

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

export const DEFAULT_SCOPES = ['conversations:readonly', 'users:readonly', 'routing:readonly', 'analytics:readonly', 'externalContacts:readonly']
