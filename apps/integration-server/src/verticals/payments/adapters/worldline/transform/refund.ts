import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, worldlineDateTime } from './shared'
import type { RawWorldlineAmountOfMoney, RawWorldlineStatusOutput } from './charge'

/**
 * Worldline Direct "Refund" object. The refund id is derived from the parent
 * payment id (`{paymentId}` suffixed with a sequence, e.g. `…_0`); money lives
 * under `refundOutput.amountOfMoney`.
 *
 * Docs: https://docs.direct.worldline-solutions.com/en/api-reference#tag/Refunds
 */
export interface RawWorldlineRefundOutput {
  amountOfMoney?: RawWorldlineAmountOfMoney
  references?: {
    merchantReference?: string
    paymentReference?: string
  }
  paymentMethod?: string
}

export interface RawWorldlineRefund {
  id?: string
  status?: string
  refundOutput?: RawWorldlineRefundOutput
  statusOutput?: RawWorldlineStatusOutput
  [k: string]: unknown
}

function mapStatus(raw: RawWorldlineRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'REFUNDED':
    case 'CAPTURED':
      return 'succeeded'
    case 'REJECTED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'CREATED':
    case 'PENDING_APPROVAL':
    case 'REFUND_REQUESTED':
    case 'PENDING_COMPLETION':
      return 'pending'
    default:
      return 'pending'
  }
}

/**
 * Worldline refund ids embed the payment id (`{paymentId}_{seq}`). Strip the
 * trailing sequence to recover the charge id this refund belongs to.
 */
function chargeIdOf(id: string | undefined): string {
  if (!id) return ''
  const lastUnderscore = id.lastIndexOf('_')
  return lastUnderscore === -1 ? id : id.slice(0, lastUnderscore)
}

export function transformRefund(raw: RawWorldlineRefund): Refund {
  const out = raw.refundOutput ?? {}
  const money = out.amountOfMoney ?? {}
  const refs = out.references ?? {}
  const so = raw.statusOutput ?? {}
  const changedAt = toIsoDatetime(worldlineDateTime(so.statusCodeChangeDateTime))

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: chargeIdOf(raw.id),
    amount: money.amount ?? 0,
    currency: pickCurrency(money.currencyCode),
    status: mapStatus(raw),
    gateway: 'worldline',
    metadata: strMap({
      merchantReference: refs.merchantReference,
      paymentReference: refs.paymentReference,
      paymentMethod: out.paymentMethod,
      statusCode: so.statusCode,
      worldlineStatus: raw.status,
    }),
    createdAt: changedAt,
    updatedAt: changedAt,
    raw,
  }
}
