import { requireAmount } from '@opensteward/shared'

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawSquarePayment {
  id?: string
  amount_money?: { amount?: number; currency?: string }
  refunded_money?: { amount?: number; currency?: string }
  status?: string
  customer_id?: string
  buyer_email_address?: string
  source_type?: string
  receipt_url?: string
  receipt_number?: string
  note?: string
  refund_ids?: string[]
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSquarePayment): ChargeStatus {
  const refunded = raw.refunded_money?.amount ?? 0
  const amount = raw.amount_money?.amount ?? 0
  if (refunded > 0 && refunded < amount) return 'partially_refunded'
  if (refunded > 0 && refunded === amount) return 'refunded'
  switch (raw.status) {
    case 'COMPLETED':
      return 'succeeded'
    case 'APPROVED':
    case 'PENDING':
      return 'pending'
    case 'FAILED':
      return 'failed'
    case 'CANCELED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawSquarePayment): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: requireAmount(raw.amount_money?.amount, 'square charge'),
    currency: pickCurrency(raw.amount_money?.currency),
    amountRefunded: raw.refunded_money?.amount,
    status: mapStatus(raw),
    customerId: raw.customer_id,
    receiptEmail: raw.buyer_email_address,
    receiptUrl: raw.receipt_url,
    description: raw.note,
    refundIds: raw.refund_ids,
    gateway: 'square',
    metadata: strMap({ receipt_number: raw.receipt_number, source_type: raw.source_type }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
