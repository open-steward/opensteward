/**
 * ZorroSign REST API constants.
 *
 * ZorroSign is a blockchain-based digital-transaction-management platform
 * (Z-Sign for signatures, Z-Fill for intelligent forms / templates, Z-Flow
 * for workflows, Z-Vault for document storage). Partner integrations are
 * built against ZorroSign's Open API and authenticate with an account-issued
 * API key passed in the `X-API-KEY` header — there is no OAuth handshake.
 *
 * ZorroSign exposes a production environment and a staging/sandbox
 * environment. The customer selects which one to target via the credential
 * form (`environment`); the chosen base URL is stored on
 * `credentials.extra.baseUrl`.
 */

export const API_VERSION = 'v2'

/** Production REST base. */
export const PROD_BASE_URL = 'https://api.zorrosign.com/api/v2'

/** Staging / sandbox REST base. */
export const SANDBOX_BASE_URL = 'https://api-staging.zorrosign.com/api/v2'

/** Default base when no environment was selected. */
export const DEFAULT_BASE_URL = PROD_BASE_URL

/** Header carrying the account API key. */
export const API_KEY_HEADER = 'X-API-KEY'

/** ZorroSign list endpoints are page + page_size paginated. */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
