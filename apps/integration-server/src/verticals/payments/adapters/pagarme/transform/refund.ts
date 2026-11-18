/**
 * Pagar.me has no standalone refund resource: a refund is performed by
 * **cancelling a charge** — `DELETE /charges/{id}` with an optional partial
 * `amount`. The response echoes the (now `canceled` or `partial_canceled`)
 * Charge, whose `last_transaction` describes the reversal. We synthesise a
 * canonical **Refund** from that charge: the refund id is the charge's reversal
 * transaction id, the `chargeId` is the charge id, and the amount is the
 * cancelled amount.
 *
 * Because the gateway only echoes the charge, there is no `list`/`get` refund
 * endpoint — the adapter implements only `createRefund`.
 *
 * Ref: https://docs.pagar.me/reference/cancelar-cobrança
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import type { RawPagarmeCharge } from './charge'
import { pickCurrency, strMap } from './shared'

/**
 * Map the cancelled charge's status to a refund status. `canceled` /
 * `partial_canceled` mean the reversal succeeded; anything else is still
 * pending.
 */
function mapStatus(chargeStatus: string | undefined): RefundStatus {
  switch ((chargeStatus ?? '').toLowerCase()) {
    case 'canceled':
    case 'partial_canceled':
      return 'succeeded'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

/**
 * Build a canonical Refund from the cancelled-charge response. `amount` is the
 * cancelled amount the caller requested (Pagar.me's response does not surface
 * a discrete "refunded amount" field), falling back to the charge's full
 * amount for a full cancellation.
 */
export function transformRefund(charge: RawPagarmeCharge, requestedAmount?: number): Refund {
  const lastTx = charge.last_transaction
  const amount = requestedAmount ?? charge.amount ?? 0
  return {
    id: String(lastTx?.id ?? charge.id ?? ''),
    externalId: String(lastTx?.id ?? charge.id ?? ''),
    chargeId: String(charge.id ?? ''),
    amount,
    currency: pickCurrency(charge.currency),
    status: mapStatus(charge.status),
    gateway: 'pagarme',
    metadata: strMap({
      charge_status: charge.status,
      transaction_type: lastTx?.transaction_type,
      gateway_id: lastTx?.gateway_id ?? charge.gateway_id,
    }),
    createdAt: toIsoDatetime(charge.canceled_at ?? charge.updated_at),
    updatedAt: toIsoDatetime(charge.updated_at ?? charge.canceled_at),
    raw: charge,
  }
}
