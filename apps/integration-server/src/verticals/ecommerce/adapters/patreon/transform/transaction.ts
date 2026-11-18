/**
 * Patreon Pledge Event → canonical Transaction.
 *
 * Patreon doesn't expose discrete transaction records via the v2 API.
 * Instead, we model each member's charge event as a transaction using
 * the member resource data:
 *
 *  - A successful last_charge → SALE / SUCCESS transaction
 *  - A declined last_charge → SALE / FAILURE transaction
 *  - lifetime_support_cents is used for the cumulative amount
 *
 * This is a synthetic mapping: one member = one transaction representing
 * their most recent charge.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'

export interface RawPatreonChargeEvent {
  id: string
  last_charge_date?: string | null
  last_charge_status?: string | null // Paid | Declined | Deleted | Pending | Refunded | Fraud | Other
  currently_entitled_amount_cents?: number
  lifetime_support_cents?: number
  patron_status?: string | null
  email?: string
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapChargeStatus(status: string | null | undefined): TransactionStatus {
  switch (status) {
    case 'Paid':
      return 'SUCCESS'
    case 'Declined':
    case 'Deleted':
    case 'Fraud':
    case 'Other':
      return 'FAILURE'
    case 'Pending':
      return 'PENDING'
    case 'Refunded':
      return 'SUCCESS' // refund is a separate concept
    default:
      return 'PENDING'
  }
}

function mapChargeKind(status: string | null | undefined): TransactionKind {
  if (status === 'Refunded') return 'REFUND'
  return 'SALE'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawPatreonChargeEvent): Transaction {
  const amountCents = raw.currently_entitled_amount_cents ?? 0

  // Extract order (member) id — same as the member record
  const rels = raw._relationships as Record<
    string,
    { data?: { type: string; id: string } }
  > | undefined
  const campaignId = rels?.['campaign']?.data?.id

  return {
    id: `txn-${raw.id}`,
    orderId: raw.id, // member id serves as order id
    kind: mapChargeKind(raw.last_charge_status),
    status: mapChargeStatus(raw.last_charge_status),
    amount: { amount: amountCents / 100, currency: 'USD' },
    gateway: 'patreon',
    processedAt: raw.last_charge_date ?? undefined,
    createdAt: raw.last_charge_date ?? undefined,
    metadata: {
      ...(raw as Record<string, unknown>),
      lifetimeSupportCents: raw.lifetime_support_cents,
      patronStatus: raw.patron_status,
      campaignId,
    },
  }
}
