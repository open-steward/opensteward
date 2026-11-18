import type { Refund, RefundReason, RefundStatus } from '../../../schema/refund'
import { toIso, strMap } from './shared'

export interface RawStripeRefund {
  id: string
  object: 'refund'
  amount: number
  currency: string
  status?: string | null
  reason?: string | null
  charge?: string | null
  payment_intent?: string | null
  receipt_number?: string | null
  failure_reason?: string | null
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

function mapStatus(raw: RawStripeRefund): RefundStatus {
  switch (raw.status) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
    case 'canceled':
      return raw.status === 'failed' ? 'failed' : 'cancelled'
    default:
      return 'pending'
  }
}

function mapReason(raw: RawStripeRefund): RefundReason | undefined {
  switch (raw.reason) {
    case 'duplicate':
      return 'duplicate'
    case 'fraudulent':
      return 'fraudulent'
    case 'requested_by_customer':
      return 'requested_by_customer'
    case 'expired_uncaptured_charge':
      return 'expired_uncaptured_charge'
    default:
      return raw.reason ? 'other' : undefined
  }
}

export function transformRefund(raw: RawStripeRefund): Refund {
  return {
    id: raw.id,
    externalId: raw.id,
    chargeId: raw.charge ?? raw.payment_intent ?? '',
    amount: raw.amount,
    currency: raw.currency.toUpperCase(),
    status: mapStatus(raw),
    reason: mapReason(raw),
    receiptNumber: raw.receipt_number ?? undefined,
    failureReason: raw.failure_reason ?? undefined,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}

export function untransformRefund(r: Partial<Refund>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (r.chargeId !== undefined) out.charge = r.chargeId
  if (r.amount !== undefined) out.amount = r.amount
  if (r.reason !== undefined) out.reason = r.reason
  if (r.metadata) out.metadata = r.metadata
  return out
}
