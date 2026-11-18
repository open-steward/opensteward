/**
 * Frappe Helpdesk REST API constants.
 *
 * Frappe is self-hosted: the base URL is the customer's own Frappe site.
 * `siteUrl` is passed via credentials.extra.siteUrl (e.g. https://support.example.com).
 *
 * Auth: token api_key:api_secret (see auth.ts)
 *
 * Docs: https://docs.frappe.io/framework/user/en/api/rest
 *       https://docs.frappe.io/framework/user/en/guides/integration/rest_api/token_based_authentication
 */

/** Frappe REST resource endpoint prefix — appended to siteUrl at runtime */
export const RESOURCE_PATH = '/api/resource'

/** Default number of records per page (Frappe default is 20; cap at 100) */
export const DEFAULT_PAGE_SIZE = 100

// ── DocType name constants ─────────────────────────────────────────────────
export const DOCTYPE_TICKET          = 'HD Ticket'
export const DOCTYPE_TICKET_COMMENT  = 'HD Ticket Comment'
export const DOCTYPE_CUSTOMER        = 'HD Customer'
export const DOCTYPE_AGENT           = 'HD Agent'
export const DOCTYPE_TEAM            = 'HD Team'
export const DOCTYPE_TICKET_STATUS   = 'HD Ticket Status'
export const DOCTYPE_TICKET_PRIORITY = 'HD Ticket Priority'
export const DOCTYPE_SAVED_REPLY     = 'HD Saved Reply'
