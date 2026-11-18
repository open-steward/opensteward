/**
 * 2Checkout Payout ↔ canonical Payout.
 *
 * 2Checkout exposes merchant payouts via `GET /payouts/` in the REST 6.0 API.
 * Each payout record contains a `TransferCompletionDate`, `PaymentType`,
 * `Amount` (major-unit decimal), `Currency`, and `Status`.
 *
 * Status mapping:
 *   PAID            → paid
 *   PARTIALLY_PAID  → in_transit
 *   CANCELED        → cancelled
 *   NOT_PAID        → pending
 *
 * Docs: https://docs.2checkout.com/api-reference/reference/accounting.md
 */
import type { Payout, PayoutStatus, PayoutMethod } from '../../../schema/payout'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawVerifone2checkoutPayout {
  /** Unique identifier for the payout transfer. */
  Reference?: string | number | null
  TransferCompletionDate?: string | null
  /** WIRE | PAYPAL | CHECK | PAYONEER | WEBMONEY | INTERNATIONAL_WIRE */
  PaymentType?: string | null
  /** Major-unit decimal amount. */
  Amount?: string | number | null
  /** ISO-4217 currency code. */
  Currency?: string | null
  /** PAID | PARTIALLY_PAID | CANCELED | NOT_PAID */
  Status?: string | null
  TotalSales?: string | number | null
  TotalFees?: string | number | null
  TotalRefunds?: string | number | null
  Invoices?: Array<Record<string, unknown>> | null
  Summary?: Record<string, unknown> | null
  [k: string]: unknown
}

function mapStatus(raw: RawVerifone2checkoutPayout): PayoutStatus {
  switch ((raw.Status ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid'
    case 'PARTIALLY_PAID':
      return 'in_transit'
    case 'CANCELED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function mapMethod(_raw: RawVerifone2checkoutPayout): PayoutMethod | undefined {
  // 2Checkout uses WIRE / INTERNATIONAL_WIRE / PAYPAL / CHECK / PAYONEER /
  // WEBMONEY — none map cleanly to 'standard' | 'instant', so we leave as
  // undefined and preserve the original in metadata.
  return undefined
}

export function transformPayout(raw: RawVerifone2checkoutPayout): Payout {
  const currency = pickCurrency(raw.Currency)
  const ref = String(raw.Reference ?? '')
  return {
    id: ref,
    externalId: ref,
    amount: toMinorUnits(raw.Amount, currency) ?? 0,
    currency,
    status: mapStatus(raw),
    method: mapMethod(raw),
    arrivalDate: toIsoDatetime(raw.TransferCompletionDate ?? undefined),
    gateway: 'verifone-2checkout',
    metadata: strMap({
      paymentType: pickStr(raw.PaymentType),
      totalSales: raw.TotalSales,
      totalFees: raw.TotalFees,
      totalRefunds: raw.TotalRefunds,
    }),
    createdAt: toIsoDatetime(raw.TransferCompletionDate ?? undefined),
    raw,
  }
}
