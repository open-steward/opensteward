/**
 * Pega CRM adapter constants.
 *
 * Pega Platform exposes CRM data through two mechanisms:
 *   1. The built-in REST API at /prweb/api/v1  (cases, data pages, assignments)
 *   2. Named data pages exposed via GET /prweb/api/v1/data/{DataPageName}
 *
 * The tenant base URL follows the pattern:
 *   https://{tenant}.pegacloud.io   (Pega Cloud)
 *   https://{host}:{port}           (on-premises / private cloud)
 *
 * OAuth2 endpoints are relative to the context root (/prweb by default).
 */

/** Path prefix for the built-in Pega API (v1). Appended to the tenant base URL. */
export const PEGA_API_PATH = '/prweb/api/v1'

/**
 * OAuth2 authorization endpoint path.
 * Full URL: {baseUrl}/prweb/PRRestService/oauth2/v1/authorize
 */
export const PEGA_OAUTH_AUTH_PATH = '/prweb/PRRestService/oauth2/v1/authorize'

/**
 * OAuth2 token endpoint path.
 * Full URL: {baseUrl}/prweb/PRRestService/oauth2/v1/token
 */
export const PEGA_OAUTH_TOKEN_PATH = '/prweb/PRRestService/oauth2/v1/token'

/** Data-page name for the contact list in Pega Sales Automation. */
export const PEGA_DATA_PAGE_CONTACTS = 'D_crmContactList'

/** Data-page name for the account (company) list in Pega Sales Automation. */
export const PEGA_DATA_PAGE_ACCOUNTS = 'D_crmAccountList'

/** Data-page name for the lead list in Pega Sales Automation. */
export const PEGA_DATA_PAGE_LEADS = 'D_crmLeadList'

/** Data-page name for the opportunity list in Pega Sales Automation. */
export const PEGA_DATA_PAGE_OPPORTUNITIES = 'D_crmOpportunityList'

/** Data-page name for a single contact detail page. */
export const PEGA_DATA_PAGE_CONTACT_DETAIL = 'D_crmContact'

/** Data-page name for a single account (company) detail page. */
export const PEGA_DATA_PAGE_ACCOUNT_DETAIL = 'D_crmAccount'

/** Data-page name for a single lead detail page. */
export const PEGA_DATA_PAGE_LEAD_DETAIL = 'D_crmLead'

/** Data-page name for a single opportunity detail page. */
export const PEGA_DATA_PAGE_OPPORTUNITY_DETAIL = 'D_crmOpportunity'

/** Default page size when paginating Pega data-page results. */
export const PEGA_DEFAULT_PAGE_SIZE = 25

/**
 * Default OAuth2 scopes requested when none are explicitly configured.
 *
 * WARNING: 'openid' and 'profile' are standard OIDC identity scopes. They
 * do NOT grant access to Pega cases, data pages, or CRM resources. Operators
 * MUST extend this list with application-specific scopes defined in their
 * Pega OAuth 2.0 Client Registration (e.g. 'openid profile crm:read crm:write'
 * or whatever scopes grant access to D_crm* data pages and /cases endpoints
 * in their deployment). Pass the required scopes via PegaCrmAdapterConfig.scopes
 * or the overrideScopes argument to getAuthUrl().
 */
export const DEFAULT_PEGA_SCOPES: readonly string[] = [
  'openid',
  'profile',
]

/**
 * Pega Sales Automation case type for Opportunities.
 * Used when creating/updating opportunity cases via POST /cases.
 */
export const PEGA_OPPORTUNITY_CASE_TYPE = 'PegaCRM-Work-Opportunity'

/**
 * Pega Sales Automation case type for Activities (tasks).
 * Used when creating/updating activity cases via POST /cases.
 */
export const PEGA_ACTIVITY_CASE_TYPE = 'PegaCRM-Work-Task'
