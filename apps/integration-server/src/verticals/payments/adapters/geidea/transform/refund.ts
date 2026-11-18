/**
 * Geidea refunds are taken against an order (`POST /pgw/api/v2/direct/refund`
 * with `orderId` + `refundAmount`). The response echoes the order with its
 * refund transactions; the canonical **Refund** is keyed on the order it
 * belongs to. A refund-type transaction in `transactions[]` carries the refund
 * id, amount and status. Amounts arrive as major-unit decimals — converted to
 * canonical integer minor units via `toMinorUnits`.
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, toMinorUnits, strMap, pickStr } from './shared'
import type { RawGeideaOrder, RawGeideaTransaction } from './charge'

function mapRefundStatus(raw: string | null | undefined): RefundStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'success':
    case 'succeeded':
    case 'refunded':
    case 'completed':
      return 'succeeded'
    case 'failed':
    case 'declined':
      return 'failed'
    case 'cancelled':
    case 'canceled':
    case 'voided':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/**
 * Extract the refund-type transaction (the most recent, when an order has been
 * refunded several times) from a Geidea order response. Returns `undefined`
 * when no refund transaction is present.
 */
export function extractRefundTransaction(
  order: RawGeideaOrder,
): RawGeideaTransaction | undefined {
  const refunds = (order.transactions ?? []).filter(
    (t) => (t.type ?? '').toLowerCase() === 'refund',
  )
  return refunds.length ? refunds[refunds.length - 1] : undefined
}

/**
 * Transform a Geidea refund into a canonical Refund. `order` supplies the
 * charge id (orderId) and the fallback currency; `tx` is the refund-type
 * transaction when one is present.
 */
export function transformRefund(
  order: RawGeideaOrder,
  tx?: RawGeideaTransaction,
): Refund {
  const currency = pickCurrency(tx?.currency ?? order.currency)
  const orderId = String(order.orderId ?? order.merchantReferenceId ?? '')
  return {
    id: String(tx?.transactionId ?? orderId),
    externalId: String(tx?.transactionId ?? orderId),
    chargeId: orderId,
    amount: toMinorUnits(tx?.amount ?? order.amount ?? order.totalAmount, currency) ?? 0,
    currency,
    status: mapRefundStatus(tx?.status ?? order.detailedStatus ?? order.status),
    failureReason: pickStr(tx?.responseMessage ?? tx?.codeMessage),
    gateway: 'geidea',
    metadata: strMap({
      merchantReferenceId: order.merchantReferenceId,
      detailedStatus: order.detailedStatus,
    }),
    createdAt: toIsoDatetime(order.updatedDate ?? order.createdDate),
    updatedAt: toIsoDatetime(order.updatedDate),
    raw: tx ?? order,
  }
}
