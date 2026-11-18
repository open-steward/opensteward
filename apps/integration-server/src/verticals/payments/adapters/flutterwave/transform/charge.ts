import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawFlutterwaveTransaction {
  id?: number
  tx_ref?: string
  flw_ref?: string
  status?: string
  amount?: number
  currency?: string
  payment_type?: string
  customer?: { email?: string; name?: string; id?: number }
  processor_response?: string
  narration?: string
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFlutterwaveTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'successful':
    case 'completed':
      return 'succeeded'
    case 'pending':
      return 'pending'
    case 'failed':
    case 'cancelled':
      return raw.status === 'cancelled' ? 'cancelled' : 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawFlutterwaveTransaction): Charge {
  return {
    id: String(raw.id ?? raw.tx_ref ?? ''),
    externalId: String(raw.tx_ref ?? raw.id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    customerId: raw.customer?.id ? String(raw.customer.id) : undefined,
    receiptEmail: raw.customer?.email,
    description: raw.narration,
    failureMessage: raw.processor_response,
    gateway: 'flutterwave',
    metadata: strMap({ payment_type: raw.payment_type, flw_ref: raw.flw_ref }),
    createdAt: raw.created_at,
    raw,
  }
}
