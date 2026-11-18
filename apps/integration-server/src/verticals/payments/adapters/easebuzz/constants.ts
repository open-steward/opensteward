/**
 * Easebuzz REST API constants.
 *
 * Easebuzz splits its surface across two hosts:
 *  - the "pay" host (`pay` / `testpay`) hosts the customer-facing checkout
 *    redirect (`/pay/<access_key>`) and the initiate-link call;
 *  - the "dashboard" host (`dashboard` / `testdashboard`) hosts the
 *    server-to-server query + post-payment APIs we use here — transaction
 *    retrieve, refund, and refund status.
 *
 * Environment is selected by the merchant when they connect (test vs prod);
 * we default to prod when unspecified.
 *
 * Docs: https://docs.easebuzz.in/docs/payment-gateway
 */

export const DASHBOARD_BASE_URL_PROD = 'https://dashboard.easebuzz.in'
export const DASHBOARD_BASE_URL_TEST = 'https://testdashboard.easebuzz.in'

export const PAY_BASE_URL_PROD = 'https://pay.easebuzz.in'
export const PAY_BASE_URL_TEST = 'https://testpay.easebuzz.in'

/** Server-to-server endpoint paths (POST, form-encoded) on the dashboard host. */
export const TRANSACTION_RETRIEVE_PATH = '/transaction/v2/retrieve'
export const REFUND_PATH = '/transaction/v2/refund'
export const REFUND_RETRIEVE_PATH = '/refund/v1/retrieve'

/** Easebuzz settles in Indian Rupees. */
export const DEFAULT_CURRENCY = 'INR'

export type EasebuzzEnv = 'test' | 'prod'

export function dashboardBaseUrl(env: EasebuzzEnv): string {
  return env === 'test' ? DASHBOARD_BASE_URL_TEST : DASHBOARD_BASE_URL_PROD
}

export function payBaseUrl(env: EasebuzzEnv): string {
  return env === 'test' ? PAY_BASE_URL_TEST : PAY_BASE_URL_PROD
}
