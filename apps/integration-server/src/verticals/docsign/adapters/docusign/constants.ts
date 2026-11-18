/**
 * DocuSign REST API constants.
 *
 * DocuSign exposes two production environments — account.docusign.com
 * (prod) and account-d.docusign.com (developer/sandbox). The adapter is
 * configured at runtime by the `accountId` + `baseUri` returned from the
 * userinfo endpoint after OAuth; the constants below pin the OAuth
 * endpoints + sandbox defaults.
 *
 * Docs: https://developers.docusign.com/docs/esign-rest-api/
 */
export const API_VERSION = 'v2.1'

/**
 * Fallback account base URI, in the shape /oauth/userinfo returns `base_uri`
 * (`https://demo.docusign.net`, no path): the client appends
 * `/restapi/v2.1/accounts/...` itself, so a `/restapi` here would be doubled.
 */
export const DEFAULT_BASE_URI = 'https://demo.docusign.net'

export const OAUTH_AUTHORIZE_URL = 'https://account-d.docusign.com/oauth/auth'
export const OAUTH_TOKEN_URL = 'https://account-d.docusign.com/oauth/token'
export const OAUTH_USERINFO_URL = 'https://account-d.docusign.com/oauth/userinfo'

export const DEFAULT_PAGE_SIZE = 100

/**
 * Largest `count` DocuSign serves on one list request. Documented for
 * GET /envelopes (listStatusChanges): "The maximum value is 1000." GET
 * /templates documents no maximum (only a 2,000 default when `count` is
 * omitted), so 1000 is the adapter-wide ceiling: exact for envelopes and
 * conservative for templates. The recipients, documents and audit-event lists
 * take no paging parameter at all and are sliced locally.
 * https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json
 */
export const MAX_PAGE_SIZE = 1000

/**
 * `from_date` for an envelope read with no `updated_after`. GET /envelopes
 * (listStatusChanges): "Your request must include one or more of the following
 * parameters: `from_date`, `envelope_ids`, `transaction_ids`", and "If no
 * `from_date` query parameter is specified, envelopes from more than two years
 * ago will not be returned." The spec gives `from_date` no lower bound, so the
 * value is a choice rather than a documented one: a date taken to predate any
 * status change an account holds, in the ISO 8601 form with an explicit time
 * zone offset that the spec recommends.
 */
export const ENVELOPES_FROM_DATE_FLOOR = '2000-01-01T00:00:00Z'

/**
 * Default DocuSign scopes. `signature` covers envelope read/write; `impersonation`
 * is required for the server-to-server JWT grant flow.
 */
export const DEFAULT_SCOPES = ['signature', 'impersonation']
