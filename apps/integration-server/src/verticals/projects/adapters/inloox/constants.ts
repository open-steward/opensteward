/**
 * InLoox OData REST API constants.
 *
 * Base URL: https://app.inloox.com/api/v1/odata/
 * Auth:     Personal Access Token via `x-api-key` header
 * Docs:     https://app.inloox.com/api/v1/swagger/index.html
 *
 * The OData API is available for InLoox Cloud at app.inloox.com.
 * On-premises installations substitute their own domain.
 * InLoox returns up to 100 entities per OData page by default; use
 * `$top` and `$skip` for pagination.
 */

/** OData base URL for the InLoox Cloud instance (no trailing slash). */
export const API_BASE_URL = 'https://app.inloox.com/api/v1/odata'

/** Personal Access Token generation page — used as the "help URL" for the Connect Link form. */
export const TOKEN_HELP_URL = 'https://login.inloox.com/Manage/PersonalAccessToken'

/** Default OData page size (InLoox returns 100 per call by default). */
export const DEFAULT_PAGE_SIZE = 100
