import type { Refund, RefundStatus } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMollieRefund {
  id?: string
  paymentId?: string
  amount?: { value?: string; currency?: string }
  status?: string
  description?: string
  createdAt?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawMollieRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'refunded':
      return 'succeeded'
    case 'queued':
    case 'pending':
    case 'processing':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawMollieRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.paymentId ?? ''),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    gateway: 'mollie',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt,
    raw,
  }
}
