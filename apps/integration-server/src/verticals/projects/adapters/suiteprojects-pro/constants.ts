/**
 * NetSuite SuiteProjects Pro (OpenAir) REST API constants.
 *
 * The API is account-specific: every request must target
 * https://<company-id>.app.netsuitesuiteprojectspro.com/rest/v1
 *
 * The company ID is obtained from the OAuth exchange and stored in
 * credentials.extra.companyId. For the OAuth flow, a placeholder base is
 * used at auth-URL construction time; the real host is substituted once the
 * access token is known.
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/netsuite-suiteprojects-pro/online-help/article_160008162500.html
 */

/** Template for the REST API base URL — substitute {companyId} at runtime. */
export const API_BASE_URL_TEMPLATE =
  'https://{companyId}.app.netsuitesuiteprojectspro.com/rest/v1'

/** Sandbox base URL template */
export const API_SANDBOX_BASE_URL_TEMPLATE =
  'https://{companyId}.app.sandbox.netsuitesuiteprojectspro.com/rest/v1'

/** OAuth2 authorize endpoint template (account-specific) */
export const OAUTH_AUTHORIZE_URL_TEMPLATE =
  'https://{companyId}.app.netsuitesuiteprojectspro.com/login/oauth2/v1/authorize'

/** OAuth2 token endpoint template (account-specific) */
export const OAUTH_TOKEN_URL_TEMPLATE =
  'https://{companyId}.app.netsuitesuiteprojectspro.com/login/oauth2/v1/token'

/**
 * Default scopes.
 * `rest` grants access to all resources except BI Connector.
 */
export const DEFAULT_SCOPES = ['rest']

/** Objects per page when the caller names none (the API's own default is 100). */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Largest `limit` the API accepts: "You can set the maximum number of objects
 * to be returned per page between 1 and 1000."
 * (https://docs.oracle.com/en/cloud/saas/netsuite-suiteprojects-pro/online-help/article_160035263040.html)
 */
export const MAX_PAGE_SIZE = 1000
