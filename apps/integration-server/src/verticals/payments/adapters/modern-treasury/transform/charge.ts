import type { Charge, ChargeStatus } from '../../../schema/charge'

/**
 * A Modern Treasury payment order, the documented fields this transform reads.
 * Source: the `payment_order` schema in the vendor's OpenAPI
 * (github.com/Modern-Treasury/modern-treasury-openapi, openapi/mt_openapi_spec_v1.yaml),
 * returned by `GET /api/payment_orders` and `GET /api/payment_orders/{id}`.
 */
export interface RawModernTreasuryPaymentOrder {
  id: string
  object?: string
  /** "Value in specified currency's smallest unit. e.g. $10 would be represented as 1000 (cents)." */
  amount: number
  currency: string
  /** "A `credit` moves money from your account to someone else's. A `debit` pulls money from someone else's account to your own." */
  direction: 'credit' | 'debit'
  status: string
  /** "If the payment order is tied to a specific Counterparty, their id will appear, otherwise `null`." */
  counterparty_id?: string | null
  /** "An optional description for internal use." */
  description?: string | null
  metadata?: Record<string, string>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * The documented `status` enum: "approved", "cancelled", "completed", "denied",
 * "failed", "held", "needs_approval", "pending", "processing", "returned",
 * "reversed", "sent", "stopped" ("The current status of the payment order.").
 */
const STATUS: Record<string, ChargeStatus> = {
  approved: 'pending',
  needs_approval: 'pending',
  pending: 'pending',
  processing: 'pending',
  held: 'pending',
  sent: 'pending',
  completed: 'succeeded',
  failed: 'failed',
  denied: 'failed',
  returned: 'failed',
  reversed: 'refunded',
  cancelled: 'cancelled',
  stopped: 'cancelled',
}

export function transformCharge(raw: RawModernTreasuryPaymentOrder): Charge {
  if (typeof raw.id !== 'string' || raw.id === '')
    throw new Error('Modern Treasury payment order has no id')
  if (typeof raw.amount !== 'number' || !Number.isInteger(raw.amount))
    throw new Error(`Modern Treasury payment order ${raw.id} has no integer amount`)
  if (typeof raw.currency !== 'string' || raw.currency === '')
    throw new Error(`Modern Treasury payment order ${raw.id} has no currency`)
  return {
    id: raw.id,
    externalId: raw.id,
    amount: raw.amount,
    currency: raw.currency,
    status: STATUS[raw.status] ?? 'unknown',
    customerId: raw.counterparty_id ?? undefined,
    description: raw.description ?? undefined,
    gateway: 'modern-treasury',
    metadata: { ...(raw.metadata ?? {}) },
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
