/**
 * Lago REST API constants.
 *
 * Lago is an open-source metering + usage-based billing platform. The hosted
 * cloud exposes two regional hosts; self-hosted deployments serve the same API
 * under a customer-controlled origin. The API key (not the host) selects the
 * organisation, so there is no separate sandbox host — test against a staging
 * organisation key or a self-hosted instance.
 *
 *   US / default cloud : https://api.getlago.com
 *   EU cloud           : https://api.eu.getlago.com
 *
 * Every resource path lives under `/api/v1` (see `API_BASE_PATH`).
 *
 * Docs: https://getlago.com/docs/api-reference/intro
 *       https://getlago.com/docs/api-reference/api-standards
 */
export const API_BASE_URL = 'https://api.getlago.com'
export const API_EU_BASE_URL = 'https://api.eu.getlago.com'
export const API_BASE_PATH = '/api/v1'

export const CUSTOMERS_PATH = '/customers'
export const INVOICES_PATH = '/invoices'
export const CREDIT_NOTES_PATH = '/credit_notes'
export const SUBSCRIPTIONS_PATH = '/subscriptions'
export const PLANS_PATH = '/plans'
export const PAYMENTS_PATH = '/payments'

/** Lago paginates with `page` / `per_page`. */
export const DEFAULT_PAGE_SIZE = 100
