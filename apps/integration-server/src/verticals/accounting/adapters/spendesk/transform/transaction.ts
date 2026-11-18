/**
 * Spendesk Settlement → canonical Transaction
 *
 * A Settlement is the actual payment event that clears a payable.
 *
 * Settlement types:
 *   payment     — a card or wire transfer payment
 *   refund      — a refund
 *   advance     — a cash advance
 *   cashReturn  — a cash return
 *   chargeBack  — a card chargeback
 *   reimbursement — an employee reimbursement
 *
 * Payment medium:
 *   card         — paid via Spendesk card
 *   wireTransfer — paid via bank wire
 *
 * Field mapping:
 *   id            ← settlement.id
 *   type          ← settlement.type
 *   currency      ← settlement.currency
 *   totalAmount   ← settlement.amount        (minor units, foreign currency)
 *   paymentMethod ← settlement.medium        (card | wireTransfer)
 *   memo          ← settlement.transactionDescription
 *   createdAt     ← settlement.createdAt
 *   updatedAt     ← settlement.clearedAt
 *   metadata      ← raw settlement object
 */

import type { Transaction } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'

/** Safely convert an upstream value to a Date via toIsoDatetime. Never throws. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

// ── Spendesk API type ─────────────────────────────────────────────────────────

export interface SpendeskSettlementLinks {
  bankFees?: string
}

export interface SpendeskSettlement {
  id: string
  type: string        // payment | refund | advance | cashReturn | chargeBack | reimbursement
  medium: string      // card | wireTransfer
  amount: number
  currency: string
  billingAmount?: number
  billingCurrency?: string
  billingExchangeRate?: number
  transactionDescription?: string
  state?: string
  paidFrom?: string
  createdAt?: string
  clearedAt?: string
  exportedAt?: string
  links?: SpendeskSettlementLinks[]
  [key: string]: unknown
}

// ── Payment method mapping ────────────────────────────────────────────────────

function mapMedium(medium: string): string {
  if (medium === 'card') return 'CARD'
  if (medium === 'wireTransfer') return 'WIRE'
  return medium?.toUpperCase() ?? 'OTHER'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformSettlement(raw: SpendeskSettlement): Transaction {
  return {
    id: raw.id || undefined,
    type: raw.type || undefined,
    currency: raw.currency || undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    paymentMethod: raw.medium ? mapMedium(raw.medium) : undefined,
    memo: raw.transactionDescription || undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.clearedAt),
    metadata: raw as Record<string, unknown>,
  }
}
