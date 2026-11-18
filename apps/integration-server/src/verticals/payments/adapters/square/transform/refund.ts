import { requireAmount } from '@opensteward/shared'

import type { Refund, RefundReason, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawSquareRefund {
  id?: string
  payment_id?: string
  amount_money?: { amount?: number; currency?: string }
  status?: string
  reason?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSquareRefund): RefundStatus {
  switch (raw.status) {
    case 'COMPLETED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'REJECTED':
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

function mapReason(raw: RawSquareRefund): RefundReason | undefined {
  const r = (raw.reason ?? '').toLowerCase()
  if (!r) return undefined
  if (r.includes('duplicate')) return 'duplicate'
  if (r.includes('fraud')) return 'fraudulent'
  if (r.includes('customer')) return 'requested_by_customer'
  return 'other'
}

export function transformRefund(raw: RawSquareRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: raw.payment_id ?? '',
    amount: requireAmount(raw.amount_money?.amount, 'square refund'),
    currency: pickCurrency(raw.amount_money?.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    gateway: 'square',
    metadata: strMap({}),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
