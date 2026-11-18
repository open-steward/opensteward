/**
 * Klarna `Payout` (Settlement) — maps a Klarna settlement payout to the
 * canonical `Payout` type.
 *
 * Endpoint: GET /settlements/v1/payouts
 *           GET /settlements/v1/payouts/{paymentReference}
 *
 * The primary identifier is `payment_reference`, which matches the transfer
 * note on the merchant's bank statement.
 *
 * Docs: https://docs.klarna.com/acquirer/klarna/after-payments/settlements/settlement-reporting-getting-started/
 */

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawKlarnaPayout {
  payment_reference?: string
  payout_date?: string
  settlement_currency?: string
  total_settlement_amount?: number
  merchant_id?: string
  merchant_settlement_type?: string
  total_sale_amount?: number
  total_fee_amount?: number
  total_return_amount?: number
  total_reversal_amount?: number
  opening_debt_balance?: number
  closing_debt_balance?: number
  [k: string]: unknown
}

export interface RawKlarnaPayoutsResponse {
  payouts?: RawKlarnaPayout[]
  /** Settlements API `Pagination`: only `count` is required. */
  pagination?: {
    count?: number
    total?: number
    next?: string
    prev?: string
    offset?: number
  }
  [k: string]: unknown
}

function mapStatus(_raw: RawKlarnaPayout): PayoutStatus {
  // Klarna payouts are already settled when returned by the API
  return 'paid'
}

export function transformPayout(raw: RawKlarnaPayout): Payout {
  const ref = String(raw.payment_reference ?? '')
  return {
    id: ref,
    externalId: ref,
    amount: raw.total_settlement_amount ?? 0,
    currency: pickCurrency(raw.settlement_currency),
    status: mapStatus(raw),
    arrivalDate: raw.payout_date,
    gateway: 'klarna',
    metadata: strMap({
      merchant_id: raw.merchant_id,
      merchant_settlement_type: raw.merchant_settlement_type,
    }),
    createdAt: raw.payout_date,
    raw,
  }
}
