/**
 * Sezzle is a buy-now-pay-later gateway. It exposes one REST API (`/v2`) on
 * two host environments — sandbox and production — selected by the gateway
 * host, NOT by the key. API keys are minted per-environment in the matching
 * dashboard (a sandbox key only works against the sandbox gateway).
 *
 * The customer picks the environment on the Connect form; we persist it on
 * `credentials.extra.environment` and resolve the base URL from it.
 *
 * Docs:
 *   https://docs.sezzle.com/docs/api/intro
 *   https://docs.sezzle.com/docs/api/environments
 */

export const PRODUCTION_BASE_URL = 'https://gateway.sezzle.com/v2'
export const SANDBOX_BASE_URL = 'https://sandbox.gateway.sezzle.com/v2'

export type SezzleEnvironment = 'production' | 'sandbox'

export function baseUrlFor(environment: string | undefined): string {
  return environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
}

/**
 * Rows per `GET /v2/settlements/summaries` response. The size is fixed: the
 * endpoint has no size parameter, and `offset` is a row skip —
 * "Each response returns up to 30 records, so use 0 for the first 30, 30 for
 * the next 30, and so on."
 * (https://docs.sezzle.com/docs/api/core/settlements/getv2summary).
 * `/v2/customer` is unpaged, so this is also the adapter's page maximum.
 */
export const SETTLEMENTS_PAGE_SIZE = 30

/**
 * `start-date` is `required: true` on the settlement summaries report ("The
 * UTC start date for the report. Must be in yyyy-mm-dd format."). An early
 * fixed date asks for the whole history, which is what an unfiltered list
 * means; `end-date` defaults to today.
 */
export const SETTLEMENTS_DEFAULT_START_DATE = '2000-01-01'

// ── Endpoint paths (relative to the `/v2` base) ──────────────────────────────
export const AUTHENTICATION_PATH = '/authentication'
export const CUSTOMERS_PATH = '/customer'
export const customerPath = (uuid: string): string => `/customer/${uuid}`
export const orderPath = (orderUuid: string): string => `/order/${orderUuid}`
export const orderCapturePath = (orderUuid: string): string => `/order/${orderUuid}/capture`
export const orderReleasePath = (orderUuid: string): string => `/order/${orderUuid}/release`
export const orderRefundPath = (orderUuid: string): string => `/order/${orderUuid}/refund`

// ── Settlements ───────────────────────────────────────────────────────────────
export const SETTLEMENTS_SUMMARIES_PATH = '/settlements/summaries'
