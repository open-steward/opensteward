/**
 * A2X Accounting – OAuth2 endpoints and REST API base URLs.
 *
 * A2X is an ecommerce-to-accounting automation platform that reconciles
 * marketplace settlements (Amazon, Shopify, eBay, Etsy, Walmart, PayPal)
 * and posts summarised journals to Xero / QuickBooks / NetSuite / Sage.
 *
 * Partner API: https://www.a2xaccounting.com/become-an-integrator
 * Auth model: OAuth 2.0 Authorization Code + PKCE
 */

export const A2X_AUTH_URL = 'https://my.a2xaccounting.com/oauth/authorize'
export const A2X_TOKEN_URL = 'https://my.a2xaccounting.com/oauth/token'
export const A2X_API_BASE = 'https://my.a2xaccounting.com/api/v1'

// Default OAuth2 scopes requested when no overrides are supplied.
// read:settlements — list / fetch settlement summaries
// read:accounts    — list account code mappings
export const A2X_DEFAULT_SCOPES = ['read:settlements', 'read:accounts']

// A2X rate limits are not published; use a conservative ceiling.
export const RATE_LIMIT_RPM = 60
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25
