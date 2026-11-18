/**
 * actaSIGN REST API constants.
 *
 * actaSIGN (built and operated by axelity AG, Switzerland) exposes a REST
 * API covering signing processes, documents, signatories, the audit trail,
 * and templates, plus OpenID-Connect SSO and signed webhooks. Authentication
 * is OAuth 2.0 / OpenID Connect: the adapter runs the Authorization-Code
 * grant against the actaSIGN identity provider and calls the REST API with a
 * Bearer token.
 *
 * Single-tenant SaaS on the actasign.swiss platform — one fixed API host.
 *
 * Docs: https://www.actasign.swiss/en/product (REST API, OpenID Connect, webhooks)
 *
 * NOTE: the paragraphs above predate the rebuild and are not backed by the
 * documented API. The OpenAPI served at https://my.actasign.ch/api-docs/ has
 * no signing-process, signatory, audit-event or template resource, and its
 * auth is an actaPASS client-credential flow, not an Authorization-Code grant.
 */

/** Legacy REST API base, NOT in the actaSIGN OpenAPI's server list; unverified. */
export const API_BASE_URL = 'https://api.actasign.swiss/v1'

/**
 * Production base of the documented actaSIGN API. The OpenAPI document served
 * at https://my.actasign.ch/api-docs/ lists
 * `{"url":"https://web.actasign.ch/api","description":"Production service"}`
 * as its first server. Only the rebuilt signer and document reads use it; the
 * other methods still target API_BASE_URL above, which the spec does not list.
 */
export const DOCUMENTED_API_BASE_URL = 'https://web.actasign.ch/api'

/** OAuth 2.0 / OpenID Connect endpoints on the actaSIGN identity provider. */
export const OAUTH_AUTHORIZE_URL = 'https://auth.actasign.swiss/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://auth.actasign.swiss/oauth2/token'
export const OAUTH_USERINFO_URL = 'https://auth.actasign.swiss/oauth2/userinfo'

/**
 * How many per-task GETs listSigners keeps in flight. This is OpenSteward's own
 * cap, not a vendor limit: the actaSIGN OpenAPI documents no rate limit, and a
 * page can hold up to the caller's limit of tasks, each read separately.
 */
export const TASK_READ_CONCURRENCY = 5

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Default OAuth scopes used by the legacy authorization-code flow in auth.ts.
 * None of these scopes appears in the actaSIGN OpenAPI, whose info.description
 * says to "Request a Bearer token via actaPASS" with a CLIENT_ID and
 * CLIENT_SECRET "to perform a client credential" flow. Unverified; kept only
 * until auth is rebuilt.
 */
export const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'signing-processes', 'templates']
