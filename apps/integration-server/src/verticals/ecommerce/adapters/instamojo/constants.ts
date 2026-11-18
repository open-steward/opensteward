/**
 * Instamojo REST API constants.
 *
 * Instamojo exposes a v2 REST API at https://api.instamojo.com/v2/ (production)
 * and https://test.instamojo.com/v2/ for sandbox. The OAuth2 token
 * endpoint lives on www.instamojo.com (production) and test.instamojo.com
 * (sandbox).
 *
 * Docs: https://docs.instamojo.com/reference/overview-and-setup-1
 */

/** Base URL for the production REST API (trailing slash required). */
export const PROD_API_BASE = 'https://api.instamojo.com/v2'

/** Base URL for the sandbox REST API (trailing slash required). */
export const SANDBOX_API_BASE = 'https://test.instamojo.com/v2'

/** OAuth2 token endpoint for production. */
export const PROD_TOKEN_URL = 'https://www.instamojo.com/oauth2/token/'

/** OAuth2 token endpoint for sandbox. */
export const SANDBOX_TOKEN_URL = 'https://test.instamojo.com/oauth2/token/'

/** OAuth2 authorize URL for production. */
export const PROD_AUTH_URL = 'https://www.instamojo.com/oauth2/authorize/'

/** OAuth2 authorize URL for sandbox. */
export const SANDBOX_AUTH_URL = 'https://test.instamojo.com/oauth2/authorize/'

/**
 * Number of payment requests returned per page when listing.
 * Instamojo defaults to 500; we use a smaller default so incremental
 * syncs stay snappy.
 */
export const DEFAULT_PAGE_SIZE = 50

/** Maximum page size supported by the Instamojo list endpoints. */
export const MAX_PAGE_SIZE = 500

/**
 * OAuth2 scopes. Instamojo's developer OAuth supports "read write" as the
 * full scope pair.
 */
export const DEFAULT_SCOPES = ['read', 'write']

/**
 * Access tokens expire after 10 hours (36 000 seconds). We refresh 5 minutes
 * early to avoid clock-skew failures.
 */
export const TOKEN_EXPIRY_SECONDS = 36_000
