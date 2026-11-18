/**
 * Lago CreditNote ↔ canonical Refund.
 *
 * Lago has no standalone "charge"; money owed is captured on invoices, and the
 * reversal instrument is a **credit note**, which is the closest canonical
 * analogue of a refund. A credit note splits its total into `credit_amount`
 * (re-applied to the customer's balance) and `refund_amount` (paid back out of
 * band). We surface the credit note's `total_amount_cents` as the refund amount
 * and anchor `chargeId` on the originating invoice, since the canonical
 * `Charge` resource is not modelled for Lago.
 *
 * `refund_status` is pending / succeeded / failed; `reason` is a closed set
 * mapped onto the canonical `RefundReason`.
 *
 * Docs: https://getlago.com/docs/api-reference/credit-notes/get-all
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundReason, RefundStatus } from '../../../schema/refund'
import { pickCurrency } from './shared'

export interface RawLagoCreditNote {
  lago_id?: string
  sequential_id?: number
  number?: string | null
  lago_invoice_id?: string | null
  invoice_number?: string | null
  issuing_date?: string | null
  credit_status?: string | null
  refund_status?: string | null
  reason?: string | null
  description?: string | null
  currency?: string | null
  total_amount_cents?: number
  taxes_amount_cents?: number
  sub_total_excluding_taxes_amount_cents?: number
  balance_amount_cents?: number
  credit_amount_cents?: number
  refund_amount_cents?: number
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawLagoCreditNote): RefundStatus {
  // Prefer the explicit refund lifecycle; fall back to the credit lifecycle.
  switch ((raw.refund_status ?? raw.credit_status ?? '').toLowerCase()) {
    case 'succeeded':
    case 'available':
      return 'succeeded'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'voided':
      return 'cancelled'
    default:
      return 'pending'
  }
}

const REASON_MAP: Record<string, RefundReason> = {
  duplicated_charge: 'duplicate',
  product_unsatisfactory: 'requested_by_customer',
  order_change: 'requested_by_customer',
  order_cancellation: 'requested_by_customer',
  fraudulent_charge: 'fraudulent',
  other: 'other',
}

function mapReason(raw: RawLagoCreditNote): RefundReason | undefined {
  const reason = (raw.reason ?? '').toLowerCase()
  if (!reason) return undefined
  return REASON_MAP[reason] ?? 'other'
}

export function transformRefund(raw: RawLagoCreditNote): Refund {
  const id = String(raw.lago_id ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(raw.lago_invoice_id ?? raw.invoice_number ?? ''),
    amount: raw.total_amount_cents ?? raw.refund_amount_cents ?? 0,
    currency: pickCurrency(raw.currency) ?? 'USD',
    status: mapStatus(raw),
    reason: mapReason(raw),
    receiptNumber: raw.number ?? undefined,
    gateway: 'lago',
    metadata: {},
    createdAt: toIsoDatetime(raw.issuing_date ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
