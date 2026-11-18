import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawPaystackTransaction {
  id?: number
  reference?: string
  status?: string
  amount?: number
  currency?: string
  gateway_response?: string
  channel?: string
  customer?: { email?: string; id?: number }
  paid_at?: string
  created_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawPaystackTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
      return 'succeeded'
    case 'pending':
    case 'ongoing':
      return 'pending'
    case 'failed':
    case 'abandoned':
      return 'failed'
    case 'reversed':
      return 'refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPaystackTransaction): Charge {
  return {
    id: String(raw.id ?? raw.reference ?? ''),
    externalId: String(raw.reference ?? raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    customerId: raw.customer?.id ? String(raw.customer.id) : undefined,
    receiptEmail: raw.customer?.email,
    failureMessage: raw.gateway_response,
    gateway: 'paystack',
    metadata: strMap({ ...raw.metadata, channel: raw.channel }),
    createdAt: raw.created_at,
    updatedAt: raw.paid_at,
    raw,
  }
}
