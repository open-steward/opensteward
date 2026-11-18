import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * A BillDesk Refund is taken against a settled (or yet-to-settle) transaction.
 * `refund_status` is a numeric code:
 *   0799 → Refund        (original transaction had settled)
 *   0699 → Cancellation  (original transaction was still unsettled)
 * Both are successful outcomes from the merchant's perspective.
 */
export interface RawBilldeskRefund {
  objectid?: string
  refundid?: string
  transactionid?: string
  orderid?: string
  mercid?: string
  transaction_date?: string
  refund_date?: string
  txn_amount?: string
  refund_amount?: string
  currency?: string
  merc_refund_ref_no?: string
  refund_status?: string
  [k: string]: unknown
}

function mapStatus(code: string | undefined): RefundStatus {
  switch ((code ?? '').trim()) {
    case '0799': // settled refund
    case '0699': // cancellation of an unsettled txn
      return 'succeeded'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawBilldeskRefund): Refund {
  const id = String(raw.refundid ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(raw.transactionid ?? raw.orderid ?? ''),
    amount: toMinorUnits(raw.refund_amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw.refund_status),
    receiptNumber: raw.merc_refund_ref_no,
    gateway: 'billdesk',
    metadata: strMap({
      mercid: raw.mercid,
      orderid: raw.orderid,
      refund_status: raw.refund_status,
      txn_amount: raw.txn_amount,
    }),
    createdAt: toIsoDatetime(raw.refund_date ?? raw.transaction_date),
    updatedAt: toIsoDatetime(raw.refund_date ?? raw.transaction_date),
    raw,
  }
}
