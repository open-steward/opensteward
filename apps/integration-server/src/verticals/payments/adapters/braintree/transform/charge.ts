import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawBraintreeTransaction {
  id?: string
  legacyId?: string
  status?: string
  amount?: { value?: string; currencyIsoCode?: string }
  customer?: { id?: string }
  paymentMethodSnapshot?: { __typename?: string; last4?: string }
  createdAt?: string
  refundedTransactions?: Array<{ id?: string }>
  disputes?: Array<{ id?: string }>
  statusHistory?: Array<{ status?: string; timestamp?: string }>
  [k: string]: unknown
}

function mapStatus(raw: RawBraintreeTransaction): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SETTLED':
    case 'SUBMITTED_FOR_SETTLEMENT':
    case 'SETTLING':
    case 'SETTLEMENT_PENDING':
      return 'succeeded'
    case 'AUTHORIZED':
    case 'AUTHORIZING':
      return 'pending'
    case 'GATEWAY_REJECTED':
    case 'PROCESSOR_DECLINED':
    case 'FAILED':
    case 'SETTLEMENT_DECLINED':
      return 'failed'
    case 'VOIDED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawBraintreeTransaction): Charge {
  return {
    id: String(raw.id ?? raw.legacyId ?? ''),
    externalId: String(raw.id ?? raw.legacyId ?? ''),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currencyIsoCode),
    status: mapStatus(raw),
    customerId: raw.customer?.id,
    refundIds: raw.refundedTransactions?.map((r) => String(r.id ?? '')).filter(Boolean),
    disputeIds: raw.disputes?.map((d) => String(d.id ?? '')).filter(Boolean),
    gateway: 'braintree',
    metadata: strMap({}),
    createdAt: raw.createdAt,
    raw,
  }
}
