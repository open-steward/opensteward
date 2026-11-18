/**
 * 2Checkout Refund ↔ canonical Refund.
 *
 * 2Checkout exposes refunds under `/orders/{refNo}/refunds/`. Each refund
 * object carries a `RefundId`, the parent order reference (`OrderRefNo`), and
 * money as a major-unit decimal (`Amount`) alongside an ISO-4217 `Currency`.
 * The `Reason` field is a free-text string supplied at refund creation time.
 *
 * Status is inferred from `Approved`:
 *   - `true`  → succeeded
 *   - `false` → failed
 *   - absent  → pending
 *
 * Docs: https://docs.2checkout.com/get-started-with-the-2checkout-api
 */
import type { Refund, RefundReason, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawVerifone2checkoutRefund {
  RefundId?: string | number
  OrderRefNo?: string | number
  Amount?: string | number
  Currency?: string
  Approved?: boolean | null
  Reason?: string | null
  Note?: string | null
  Date?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawVerifone2checkoutRefund): RefundStatus {
  if (raw.Approved === true) return 'succeeded'
  if (raw.Approved === false) return 'failed'
  return 'pending'
}

function mapReason(raw: RawVerifone2checkoutRefund): RefundReason | undefined {
  const reason = (raw.Reason ?? '').toLowerCase()
  if (!reason) return undefined
  if (reason.includes('duplicate')) return 'duplicate'
  if (reason.includes('fraud')) return 'fraudulent'
  if (reason.includes('customer') || reason.includes('requested')) return 'requested_by_customer'
  return 'other'
}

export function transformRefund(raw: RawVerifone2checkoutRefund): Refund {
  const currency = pickCurrency(raw.Currency)
  const refundId = String(raw.RefundId ?? '')
  return {
    id: refundId,
    externalId: refundId,
    chargeId: String(raw.OrderRefNo ?? ''),
    amount: toMinorUnits(raw.Amount, currency) ?? 0,
    currency,
    status: mapStatus(raw),
    reason: mapReason(raw),
    gateway: 'verifone-2checkout',
    metadata: strMap({
      note: pickStr(raw.Note),
      rawReason: pickStr(raw.Reason),
    }),
    createdAt: toIsoDatetime(raw.Date ?? undefined),
    raw,
  }
}
