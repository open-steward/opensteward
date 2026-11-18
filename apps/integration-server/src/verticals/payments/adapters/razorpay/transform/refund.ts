import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpayRefund {
  id?: string
  payment_id?: string
  amount?: number
  currency?: string
  status?: string
  speed_requested?: string
  speed_processed?: string
  notes?: Record<string, unknown>
  receipt?: string
  created_at?: number
  [k: string]: unknown
}

function mapStatus(raw: RawRazorpayRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'processed':
      return 'succeeded'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawRazorpayRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment_id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    receiptNumber: raw.receipt,
    gateway: 'razorpay',
    metadata: strMap({ ...raw.notes, speed_processed: raw.speed_processed }),
    createdAt: toIso(raw.created_at),
    raw,
  }
}
