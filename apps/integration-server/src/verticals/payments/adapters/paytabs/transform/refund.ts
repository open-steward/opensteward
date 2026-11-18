import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * A PayTabs refund is itself a transaction (`tran_type: 'refund'`) returned by
 * `POST /payment/request`. It carries its own `tran_ref`; the parent / charged
 * transaction reference is supplied separately (`chargeId`) since the response
 * does not always echo the parent back in a single field.
 *
 * Refund `response_status` is typically `P` (Pending) on creation and `A`
 * (Authorised) once settled.
 *
 * Docs: https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Request-Response-Parameters/
 */
export interface RawPaytabsRefund {
  tran_ref?: string
  tran_type?: string
  cart_id?: string
  cart_currency?: string
  cart_amount?: string
  payment_result?: {
    response_status?: string
    response_code?: string
    response_message?: string
    transaction_time?: string
  }
  [k: string]: unknown
}

/** Map a PayTabs refund `response_status` onto the canonical {@link RefundStatus}. */
function mapStatus(raw: RawPaytabsRefund): RefundStatus {
  switch ((raw.payment_result?.response_status ?? '').toUpperCase()) {
    case 'A':
      return 'succeeded'
    case 'P':
    case 'H':
      return 'pending'
    case 'V':
    case 'C':
      return 'cancelled'
    case 'D':
    case 'E':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawPaytabsRefund, chargeId: string): Refund {
  const id = String(raw.tran_ref ?? '')
  const result = raw.payment_result ?? {}
  const status = (result.response_status ?? '').toUpperCase()
  const failed = status === 'D' || status === 'E'
  return {
    id,
    externalId: id,
    chargeId,
    amount: toMinorUnits(raw.cart_amount) ?? 0,
    currency: pickCurrency(raw.cart_currency),
    status: mapStatus(raw),
    failureReason: failed ? result.response_message : undefined,
    gateway: 'paytabs',
    metadata: strMap({
      cart_id: raw.cart_id,
      response_status: result.response_status,
      response_code: result.response_code,
      response_message: result.response_message,
    }),
    createdAt: toIsoDatetime(result.transaction_time),
    updatedAt: toIsoDatetime(result.transaction_time),
    raw,
  }
}
