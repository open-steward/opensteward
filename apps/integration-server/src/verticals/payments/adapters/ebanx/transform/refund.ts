import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * EBANX refund object — returned by /ws/refund and nested in a payment's
 * `refunds[]` array. EBANX does not echo the parent payment hash on the
 * refund, so the caller threads it in via `chargeHash`.
 */
export interface RawEbanxRefund {
  id?: string | number
  merchant_refund_code?: string
  status?: string
  amount_ext?: string | number
  currency_ext?: string
  request_date?: string
  confirm_date?: string | null
  cancel_date?: string | null
  description?: string
  [k: string]: unknown
}

/** PE pending · CO confirmed · CA cancelled. */
function mapStatus(raw: RawEbanxRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'CO':
      return 'succeeded'
    case 'CA':
      return 'cancelled'
    case 'PE':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawEbanxRefund, chargeHash?: string): Refund {
  const currency = pickCurrency(raw.currency_ext)
  return {
    id: String(raw.id ?? raw.merchant_refund_code ?? ''),
    externalId: String(raw.id ?? raw.merchant_refund_code ?? ''),
    chargeId: String(chargeHash ?? ''),
    amount: toMinorUnits(raw.amount_ext, currency),
    currency,
    status: mapStatus(raw),
    gateway: 'ebanx',
    metadata: strMap({
      merchant_refund_code: raw.merchant_refund_code,
      description: raw.description,
    }),
    createdAt: toIsoDatetime(raw.request_date),
    updatedAt: toIsoDatetime(raw.cancel_date ?? raw.confirm_date ?? raw.request_date),
    raw,
  }
}
