/**
 * Rapyd REST API constants.
 *
 * Rapyd exposes two fully separate hosts — sandbox and production — selected
 * per connection from the credential form (stored on
 * `credentials.extra.environment`). Every path is rooted at `/v1`, and that
 * `/v1` prefix is part of the string that gets signed (see `auth.ts`), so the
 * endpoint paths here are bare resource paths and the client prepends `/v1`.
 *
 * Docs: https://docs.rapyd.net/en/merchant-api-reference.html
 */
export const PRODUCTION_BASE_URL = 'https://api.rapyd.net'
export const SANDBOX_BASE_URL = 'https://sandboxapi.rapyd.net'

/** Version segment prepended to every request path and included in the signature. */
export const API_PREFIX = '/v1'

/** Rapyd's `limit` query parameter accepts 1–100; the API default is 10. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Resource paths under /v1. Rapyd has no account-wide payment-method list:
 * stored payment methods are listed per customer at
 * /v1/customers/:customer/payment_methods (see `customerPaymentMethods`).
 */
export const ENDPOINTS = {
  customers: '/customers',
  payments: '/payments',
  refunds: '/refunds',
  disputes: '/disputes',
  // GET /v1/invoices, /v1/invoices/:invoice
  // (https://docs.rapyd.net/en/list-invoices.html, retrieve-invoice.html)
  invoices: '/invoices',
  // GET /v1/payouts, /v1/payouts/:payout
  // (https://docs.rapyd.net/en/list-payouts.html, retrieve-payout.html)
  payouts: '/payouts',
  // GET /v1/plans, /v1/plans/:plan
  // (https://docs.rapyd.net/en/list-plans.html, retrieve-plan.html)
  plans: '/plans',
  // GET /v1/payments/subscriptions, /v1/payments/subscriptions/:subscription
  // (https://docs.rapyd.net/en/list-subscriptions.html, retrieve-subscription.html)
  subscriptions: '/payments/subscriptions',
} as const

/** GET /v1/customers/:customer/payment_methods ("List all the payment methods of a customer."). */
export function customerPaymentMethods(customer: string): string {
  return `/customers/${encodeURIComponent(customer)}/payment_methods`
}
