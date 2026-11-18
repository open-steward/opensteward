/**
 * SkuNexus REST API constants.
 *
 * SkuNexus is an AI-powered inventory, order, and warehouse management platform
 * for eCommerce merchants. The API follows standard Rails REST JSON conventions.
 *
 * Auth: single API key passed as the X-API-Key request header.
 * Base URL: tenant-scoped — callers must supply their subdomain via credentials.extra.subdomain
 * or fall back to the canonical app.skunexus.com host for single-tenant installations.
 */
export const API_BASE_URL = 'https://app.skunexus.com/api/v1'
export const DEFAULT_PAGE_SIZE = 100
