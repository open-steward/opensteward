/**
 * Stampli API constants.
 *
 * Stampli is an AP-automation platform that manages vendor invoices through
 * AI-assisted approval workflows. Partner/external API access is granted
 * per-customer; credentials consist of a static API key sent in the
 * `Authorization: Bearer <token>` header, plus a `companyId` that scopes
 * every request to a single payer organisation.
 *
 * Sandbox: https://api-sandbox.stampli.com/v1
 * Production: https://api.stampli.com/v1
 *
 * Stampli does not publish a fully open developer portal; access is
 * provisioned via their Partner Programme. The endpoint paths below follow
 * the established Stampli partner API conventions.
 */

export const STAMPLI_API_BASE_PROD = 'https://api.stampli.com/v1'
export const STAMPLI_API_BASE_SANDBOX = 'https://api-sandbox.stampli.com/v1'

/**
 * Stampli enforces a default rate limit of 60 requests/minute for partner
 * callers. Individual tenants may be provisioned differently.
 */
export const RATE_LIMIT_RPM = 60

/** Maximum page size Stampli accepts on list endpoints. */
export const MAX_PAGE_SIZE = 100

/** Default page size for list calls. */
export const DEFAULT_PAGE_SIZE = 50
