export const BASE_URL = 'https://api.nimble.com/api/v1'
/**
 * Deals and deal pipelines are documented only under /api/v2
 * (https://www.nimble.com/developers/docs/, e.g. "GET /api/v2/deals/pipelines").
 * No doc example shows a v2 URL, so the host is the spec's own servers
 * entry: `servers: [{ url: "https://app.nimble.com" }]`. (The v1 BASE_URL
 * keeps api.nimble.com, the host of the docs' v1 examples:
 * "POST https://api.nimble.com/api/v1/contacts?access_token=…".)
 */
export const V2_BASE_URL = 'https://app.nimble.com/api/v2'
export const OAUTH_AUTH_URL = 'https://app.nimble.com/oauth/authorize'
/** Documented: "POST https://app.nimble.com/api/oauth/token" (Authentication, https://www.nimble.com/developers/docs/). */
export const OAUTH_TOKEN_URL = 'https://app.nimble.com/api/oauth/token'
export const DEFAULT_PAGE_SIZE = 25
/**
 * Contacts per upstream page when listNotes walks contacts. The documented
 * default of GET /api/v1/contacts: "per_page … default: 30".
 */
export const CONTACTS_PAGE_SIZE = 30
