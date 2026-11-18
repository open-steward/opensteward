/**
 * Take Blip REST API constants.
 *
 * All commands are sent to a single per-tenant HTTP endpoint.
 * The tenant identifier (contract ID) is stored in credentials.extra.contractId.
 *
 * Docs: https://docs.blip.ai/
 */

/** Base URL template; {contractId} replaced at request time. */
export const API_BASE_URL_TEMPLATE = 'https://{contractId}.http.msging.net'

/** Destination address for Desk (tickets, attendants, teams, tags) commands. */
export const DESK_DESTINATION = 'postmaster@desk.msging.net'

/**
 * Destination address for contacts commands. docs.blip.ai, "Contacts": "To use
 * any feature of contacts extension send a command with the following
 * properties: ... uri /contacts ... to postmaster@crm.msging.net".
 */
export const CRM_DESTINATION = 'postmaster@crm.msging.net'

/** Default page size for list operations ($take). */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Most tickets one GET /tickets returns. docs.blip.ai, "Get all tickets of a
 * bot": "take — The number of elements to be returned. The maximum value of
 * this parameter is 100."
 */
export const TICKETS_MAX_TAKE = 100

/**
 * Upstream page size for GET /contacts. docs.blip.ai, "Get contacts": "$take
 * Limit of the total items to be returned. When not using filters, values
 * between 1 and 5000 are allowed. If not provided on the request, the default
 * take value will be 100."
 */
export const CONTACTS_TAKE = 100

/**
 * Upstream page size for GET /attendants. docs.blip.ai, "Get all bot's
 * agents" documents `$skip` and `$take` ("Limit of total of items to be
 * returned.", example 100) and no maximum; 100 is the documented example.
 */
export const ATTENDANTS_TAKE = 100
