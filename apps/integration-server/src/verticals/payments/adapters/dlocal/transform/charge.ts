import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawDLocalPayment {
  id?: string
  status?: string
  status_detail?: string
  amount?: number
  currency?: string
  payer?: { email?: string; name?: string }
  order_id?: string
  payment_method_id?: string
  payment_method_type?: string
  country?: string
  description?: string
  created_date?: string
  [k: string]: unknown
}

function mapStatus(raw: RawDLocalPayment): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
      return 'succeeded'
    case 'AUTHORIZED':
    case 'PENDING':
      return 'pending'
    case 'REJECTED':
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'REFUNDED':
      return 'refunded'
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawDLocalPayment): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    receiptEmail: raw.payer?.email,
    description: raw.description ?? raw.payer?.name,
    failureCode: raw.status_detail,
    gateway: 'dlocal',
    metadata: strMap({
      order_id: raw.order_id,
      payment_method: raw.payment_method_id,
      payment_method_type: raw.payment_method_type,
      country: raw.country,
    }),
    createdAt: raw.created_date,
    raw,
  }
}
