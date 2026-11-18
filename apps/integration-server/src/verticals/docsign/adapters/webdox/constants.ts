/**
 * Webdox CLM REST API v2 constants.
 *
 * Webdox CLM is a LATAM contract-lifecycle-management platform. The signing
 * surface is modelled around "decision workflows" — a multi-step process per
 * contract. Signature steps carry signers, and each workflow carries its
 * documents. There is a single production host; the platform is multi-tenant
 * via the `customer` field supplied at token time.
 *
 * Auth is an OAuth2 password-credentials grant (username + password + customer)
 * exchanged for a bearer token. The adapter surfaces this as a Connect Link
 * credential form (auth_type=api_key) rather than a browser OAuth redirect.
 *
 * Docs: https://doc.webdoxclm.com/docs/v2/en/index.html
 */
export const API_VERSION = 'v2'

/** Production REST base. Webdox CLM exposes a single multi-tenant host. */
export const API_BASE_URL = 'https://api.webdoxclm.com/api/v2'

/** OAuth2 password/refresh grant endpoints (same host as the REST API). */
export const TOKEN_URL = 'https://api.webdoxclm.com/api/v2/oauth/token'
export const REVOKE_URL = 'https://api.webdoxclm.com/api/v2/oauth/revoke'

/** Page-based pagination: `?page=1&per_page=100`. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
