/**
 * Pagar.me API v5 constants.
 *
 * Pagar.me is a single-host API: the same base URL serves both the sandbox
 * and production environments — the secret **key** selects the environment,
 * not the host. Sandbox keys are prefixed `sk_test_`; production keys `sk_`.
 *
 * Docs: https://docs.pagar.me/reference/autenticação-2
 */
export const API_BASE_URL = 'https://api.pagar.me/core/v5'

/** Pagar.me list endpoints accept `page` (default 1) + `size` (default 10). */
export const DEFAULT_PAGE_SIZE = 50

// ── Endpoint paths ──────────────────────────────────────────────────────────
export const ORDERS_PATH = '/orders'
export const CHARGES_PATH = '/charges'
export const CUSTOMERS_PATH = '/customers'
export const SUBSCRIPTIONS_PATH = '/subscriptions'
export const INVOICES_PATH = '/invoices'
export const PLANS_PATH = '/plans'
export const PAYABLES_PATH = '/payables'
export const BALANCE_OPERATIONS_PATH = '/balance/operations'

/** A single charge: GET/DELETE /charges/{id}. */
export const chargePath = (chargeId: string): string => `${CHARGES_PATH}/${chargeId}`

/** Cards (payment methods) are scoped to a customer: GET /customers/{id}/cards. */
export const customerCardsPath = (customerId: string): string =>
  `${CUSTOMERS_PATH}/${customerId}/cards`
