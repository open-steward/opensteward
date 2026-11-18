/**
 * Corteza CRM adapter constants.
 *
 * Corteza is self-hosted: the server is the customer's own, typed on the
 * Connect page and stored with the credentials. There is no default instance.
 *
 * Auth: OAuth2 authorization-code flow.
 * Token endpoint: {baseUrl}/auth/oauth2/token
 * Auth endpoint:  {baseUrl}/auth/oauth2/authorize
 *
 * Docs: https://docs.cortezaproject.org/corteza-docs/2024.9/integrator-guide/
 */

/** OAuth2 path segments — appended to the deployment base URL at runtime. */
export const CORTEZA_AUTH_PATH = '/auth/oauth2/authorize'
export const CORTEZA_TOKEN_PATH = '/auth/oauth2/token'

/**
 * Corteza Compose API prefix for the single-container deployment ("If you are
 * using the same domain for your API ... the URL should look something like
 * https://$BASE_URL/api/docs").
 */
export const CORTEZA_COMPOSE_PATH = '/api/compose'

/**
 * Slug of the CRM namespace provisioned by Corteza's CRM application
 * (corteza-server provision/700_crm/1000_namespace.yaml: `namespaces: crm:`).
 * Resolved to its numeric namespaceID at runtime; operators whose CRM lives
 * under another slug pass `namespaceSlug` in CortezaCrmAdapterConfig.
 */
export const DEFAULT_NAMESPACE_SLUG = 'crm'

/**
 * Module handles provisioned by Corteza's CRM application
 * (corteza-server provision/700_crm/1100_modules.yaml, keys under `modules:`).
 * Resolved to numeric moduleIDs at runtime.
 */
export const MODULE_CONTACT = 'Contact'
export const MODULE_ACCOUNT = 'Account'
export const MODULE_OPPORTUNITY = 'Opportunity'
export const MODULE_TASK = 'Task'
export const MODULE_NOTE = 'Note'

/** Default OAuth2 scope. Corteza uses "api" for full API access. */
export const DEFAULT_CORTEZA_SCOPES: readonly string[] = ['api']

/** Page size sent when the caller gives none. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Largest record page Corteza serves. server/compose/rest/record.go (2024.9.x):
 * `maxRecordSearchSize = 1000` and
 * `r.Limit = uint(math.Min(float64(r.Limit), float64(maxRecordSearchSize)))`
 * — a larger limit is clamped silently.
 */
export const MAX_PAGE_SIZE = 1000
