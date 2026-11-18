/**
 * Rebilly dispute → canonical Dispute (components/schemas/Dispute.yaml).
 * `status` enum: response-needed, under-review, forfeited, won, lost, unknown.
 * `category` enum: fraud, authorization, processing-errors,
 * consumer-disputes, uncategorized, bank-return. `transactionId`: "ID of the
 * disputed transaction." `deadlineTime`: "Latest date and time by when a
 * merchant must submit a representment for a dispute."
 */
import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { requireId, requireMoney, str } from './shared'

export interface RawRebillyDispute {
  id?: string
  transactionId?: string | null
  currency?: string
  amount?: number
  category?: string
  status?: string
  deadlineTime?: string | null
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

function mapStatus(s: string | undefined): DisputeStatus {
  switch (s) {
    case 'response-needed':
      return 'needs_response'
    case 'under-review':
      return 'under_review'
    case 'won':
      return 'won'
    case 'lost':
    case 'forfeited':
      return 'lost'
    default:
      return 'unknown'
  }
}

function mapReason(category: string | undefined): DisputeReason | undefined {
  if (category === undefined) return undefined
  return category === 'fraud' ? 'fraudulent' : 'other'
}

export function transformDispute(raw: RawRebillyDispute): Dispute {
  const id = requireId(raw.id, 'dispute id')
  const money = requireMoney(raw.amount, raw.currency, `dispute ${id}`)
  return {
    id,
    externalId: id,
    chargeId: requireId(raw.transactionId, `dispute ${id} transactionId`),
    amount: money.amount,
    currency: money.currency,
    status: mapStatus(raw.status),
    reason: mapReason(raw.category),
    evidenceDueBy: str(raw.deadlineTime),
    gateway: 'rebilly',
    metadata: {},
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
