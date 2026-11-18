/**
 * HelpCenter.io API constants.
 *
 * REST API v1 — single shared base URL (no per-tenant subdomain).
 * Auth: custom `apikey` header — NOT Authorization: Bearer.
 * Rate limit: 60 req/min per token.
 * Docs: https://self.helpcenter.io/content/using-the-helpcenter-io-api
 */
export const API_BASE_URL = 'https://api.helpcenter.io/v1'

/** HelpCenter.io caps page size at 100 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
