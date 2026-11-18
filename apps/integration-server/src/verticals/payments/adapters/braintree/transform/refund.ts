import type { Refund, RefundStatus } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawBraintreeRefund {
  id?: string
  legacyId?: string
  status?: string
  refundedTransaction?: { id?: string }
  amount?: { value?: string; currencyIsoCode?: string }
  createdAt?: string
  [k: string]: unknown
}

function mapStatus(raw: RawBraintreeRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SETTLED':
    case 'SUBMITTED_FOR_SETTLEMENT':
      return 'succeeded'
    case 'GATEWAY_REJECTED':
    case 'PROCESSOR_DECLINED':
    case 'FAILED':
      return 'failed'
    case 'VOIDED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawBraintreeRefund): Refund {
  return {
    id: String(raw.id ?? raw.legacyId ?? ''),
    externalId: String(raw.id ?? raw.legacyId ?? ''),
    chargeId: String(raw.refundedTransaction?.id ?? ''),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currencyIsoCode),
    status: mapStatus(raw),
    gateway: 'braintree',
    metadata: strMap({}),
    createdAt: raw.createdAt,
    raw,
  }
}
