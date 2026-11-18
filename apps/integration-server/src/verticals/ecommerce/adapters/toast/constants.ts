/**
 * Toast API constants.
 *
 * Toast uses a restaurant-scoped REST API. All resource endpoints require
 * a `Toast-Restaurant-External-ID` header identifying the target restaurant.
 *
 * The hostnames are not published: the docs write `https://[toast-api-hostname]`
 * and say "You receive the hostname for the sandbox environment from the Toast
 * integrations team" (https://doc.toasttab.com/doc/devguide/apiEnvironments.html).
 * The two below are the adapter's long-standing defaults, unverified.
 */

export const BASE_URL = 'https://ws-api.toasttab.com'

/** Sandbox environment for development. */
export const SANDBOX_URL = 'https://ws-sandbox-api.toasttab.com'

export const ENVIRONMENTS = {
  production: BASE_URL,
  sandbox: SANDBOX_URL,
} as const

export type ToastEnvironment = keyof typeof ENVIRONMENTS

/** Whether `value` names one of the environments above (own keys only). */
export function isToastEnvironment(value: unknown): value is ToastEnvironment {
  return typeof value === 'string' && Object.hasOwn(ENVIRONMENTS, value)
}

/** The API host of a connection's environment (production when unset). */
export function toastHost(environment: unknown): string {
  return isToastEnvironment(environment) ? ENVIRONMENTS[environment] : ENVIRONMENTS.production
}

/**
 * Authentication API login path: "https:// [toast-api-hostname]
 * /authentication/v1/authentication/login"
 * (https://doc.toasttab.com/doc/devguide/authentication.html). It lives on
 * the same host as every other Toast API, so a sandbox connection must log in
 * against the sandbox host.
 */
export const TOKEN_PATH = '/authentication/v1/authentication/login'

/**
 * GET /orders/v2/ordersBulk `pageSize`: "The maximum `pageSize` is `100`."
 * (https://doc.toasttab.com/openapi/orders/operation/ordersBulkGet/)
 */
export const ORDERS_BULK_MAX_PAGE_SIZE = 100

/**
 * GET /orders/v2/ordersBulk `startDate`: "The date must be after
 * 2015-12-01T00:00:00.000+0000." The earliest value that satisfies it, used as
 * the lower bound of an unfiltered order list.
 * (https://doc.toasttab.com/openapi/orders/operation/ordersBulkGet/)
 */
export const ORDERS_BULK_START_FLOOR = '2015-12-01T00:00:00.001Z'
