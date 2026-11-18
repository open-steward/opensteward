/**
 * Crater is a self-hosted / white-label invoicing platform.
 * The REST API lives at `<base_url>/api/v1/` where `<base_url>` is the
 * URL of the customer's own Crater instance (e.g. https://invoice.acme.com).
 *
 * Auth: Bearer token obtained via POST /oauth/token with
 *   grant_type=personal_access and the platform client credentials.
 *   The token is stored as credentials.accessToken.
 *
 * Docs: https://docs.crater.financial/
 */

// Default page size and hard cap for list endpoints.
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100

// Header that carries the business id for multi-business instances.
export const BUSINESS_HEADER = 'business'
