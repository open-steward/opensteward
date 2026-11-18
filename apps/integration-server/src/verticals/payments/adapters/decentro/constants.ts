/**
 * Decentro REST API constants.
 *
 * Decentro is an India-focused banking/payments API platform. It runs two
 * hosted environments — staging (sandbox) and production — selected by the
 * `environment` credential field. There is no per-account host.
 *
 * Endpoints used by this adapter:
 *   POST /v3/payments/upi/link            — create a UPI collection / payment link
 *   GET  /v3/payments/transaction/status  — look up a collection by Decentro txn id
 *   POST /v2/payments/upi/refund          — issue a UPI refund against a txn
 *
 * Docs: https://docs.decentro.tech/docs/api-basics
 */
export const STAGING_BASE_URL = 'https://in.staging.decentro.tech'
export const PRODUCTION_BASE_URL = 'https://in.decentro.tech'

/** Resolve the base URL from the stored `environment` credential value. */
export function baseUrlFor(environment: string | undefined): string {
  return environment === 'production' ? PRODUCTION_BASE_URL : STAGING_BASE_URL
}

export const CREATE_PAYMENT_LINK_PATH = '/v3/payments/upi/link'
export const TRANSACTION_STATUS_PATH = '/v3/payments/transaction/status'
export const UPI_REFUND_PATH = '/v2/payments/upi/refund'

export const INITIATE_PAYOUT_PATH = '/v3/core_banking/money_transfer/initiate'
export const PAYOUT_STATUS_PATH = '/core_banking/money_transfer/get_status'

/** Decentro represents money as decimal rupees; the canonical schema is paise. */
export const MINOR_UNITS_MULTIPLIER = 100

/** Decentro settles in Indian Rupee only. */
export const DEFAULT_CURRENCY = 'INR'
