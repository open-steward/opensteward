import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpayPayment {
  id?: string
  amount?: number
  amount_refunded?: number
  currency?: string
  status?: string
  customer_id?: string
  invoice_id?: string
  international?: boolean
  method?: string
  description?: string
  email?: string
  contact?: string
  error_code?: string
  error_description?: string
  notes?: Record<string, unknown>
  created_at?: number
  [k: string]: unknown
}

function mapStatus(raw: RawRazorpayPayment): ChargeStatus {
  const status = (raw.status ?? '').toLowerCase()
  const refunded = raw.amount_refunded ?? 0
  const amount = raw.amount ?? 0
  if (refunded > 0 && refunded < amount) return 'partially_refunded'
  switch (status) {
    case 'captured':
      return 'succeeded'
    case 'authorized':
    case 'created':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawRazorpayPayment): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    amountRefunded: raw.amount_refunded,
    status: mapStatus(raw),
    customerId: raw.customer_id,
    invoiceId: raw.invoice_id,
    description: raw.description,
    receiptEmail: raw.email,
    failureCode: raw.error_code,
    failureMessage: raw.error_description,
    gateway: 'razorpay',
    metadata: strMap({ ...raw.notes, method: raw.method }),
    createdAt: toIso(raw.created_at),
    raw,
  }
}
