/**
 * ProProfs Help Desk API constants.
 *
 * The API is a POST-only JSON API where auth credentials (account_email + token)
 * are sent in every request body. There is no sandbox — one production endpoint
 * for all tenants.
 *
 * Docs: https://help.proprofsdesk.com/api-integration
 */
export const API_BASE_URL = 'https://www.proprofsdesk.com/app/api/v1'

/** ProProfs returns up to 25 tickets per page. */
export const DEFAULT_PAGE_SIZE = 25
