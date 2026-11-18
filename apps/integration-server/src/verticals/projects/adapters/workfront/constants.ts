/**
 * Adobe Workfront REST API constants.
 *
 * Workfront is multi-tenant on per-customer domains
 * (`https://<org>.my.workfront.com`), so the host is supplied per
 * connection (config / `credentials.extra.instanceUrl`) rather than
 * hard-coded. Only the paths below are fixed.
 *
 * Docs: https://experienceleague.adobe.com/en/docs/workfront/using/adobe-workfront-api/api-general-information/api-basics
 */

/** REST API base path, appended to the customer domain. */
export const API_PATH = '/attask/api/v15.0'

/** OAuth2 authorization endpoint path (on the customer domain). */
export const OAUTH_AUTHORIZE_PATH = '/integrations/oauth2/authorize'

/** OAuth2 token endpoint path (on the customer domain). */
export const OAUTH_TOKEN_PATH = '/integrations/oauth2/api/v1/token'

/** Default page size. Workfront default is 100; max is 2000. */
export const DEFAULT_PAGE_SIZE = 100

/** Default OAuth scopes requested. */
export const DEFAULT_SCOPES = ['openid', 'offline_access']
