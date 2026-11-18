import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, pickStr, strMap } from './shared'

/**
 * Raw `Refund_Order_Result` payload from the CCAvenue `refundOrder` command.
 * The response is intentionally thin — CCAvenue acknowledges acceptance of the
 * refund but does not echo the amount/currency, so those are carried over from
 * the request via the `context` argument. `refund_status` is "0" on success.
 */
export interface RawCcavenueRefund {
  refund_status?: number | string
  reason?: string
  error_code?: string
  reference_no?: string | number
  [k: string]: unknown
}

/** Request-side context the response omits but the canonical Refund needs. */
export interface RefundContext {
  chargeId: string
  amount: number
  currency?: string
  refundRefNo?: string
}

function mapStatus(raw: RawCcavenueRefund): RefundStatus {
  // refund_status "0" → accepted/succeeded, "1" → failed (mirrors the API's
  // top-level status convention).
  const s = String(raw.refund_status ?? '').trim()
  if (s === '0') return 'succeeded'
  if (s === '1') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawCcavenueRefund, context: RefundContext): Refund {
  const id = context.refundRefNo ?? String(raw.reference_no ?? context.chargeId)
  return {
    id,
    externalId: id,
    chargeId: context.chargeId,
    amount: context.amount,
    currency: pickCurrency(context.currency),
    status: mapStatus(raw),
    failureReason: pickStr(raw.reason),
    gateway: 'ccavenue',
    metadata: strMap({
      refund_status: raw.refund_status,
      reason: raw.reason,
      error_code: raw.error_code,
      reference_no: context.chargeId,
    }),
    raw,
  }
}
