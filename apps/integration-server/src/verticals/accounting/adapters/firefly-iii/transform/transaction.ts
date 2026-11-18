/**
 * Transforms a Firefly III Transaction (group) into the canonical Transaction type.
 *
 * A Firefly III "transaction" is a group that contains one or more splits
 * (TransactionSplit).  For canonical mapping we use the first split to derive
 * top-level fields; all splits are surfaced in lineItems.
 *
 * Transaction types: withdrawal | deposit | transfer | reconciliation | opening balance
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

// ── Firefly III raw type ────────────────────────────────────────────────────────

export interface FireflyTransactionSplit {
  transaction_journal_id: string
  type: string
  date: string
  amount: string
  description: string
  currency_code: string
  source_id: string | null
  source_name: string | null
  source_type: string | null
  destination_id: string | null
  destination_name: string | null
  destination_type: string | null
  category_name: string | null
  budget_name: string | null
  notes: string | null
  tags: string[] | null
  reconciled: boolean
  [key: string]: unknown
}

export interface FireflyTransactionAttributes {
  created_at: string
  updated_at: string
  user: string
  group_title: string | null
  transactions: FireflyTransactionSplit[]
}

export type FireflyTransactionResource = {
  type: string
  id: string
  attributes: FireflyTransactionAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Firefly III decimal string (e.g. '12.50') to integer minor units (e.g. 1250). */
function toMinorUnits(raw: unknown): number | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const parsed = parseFloat(String(raw))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

function mapLineitem(split: FireflyTransactionSplit): TransactionLineitem {
  return {
    id: split.transaction_journal_id || undefined,
    accountId: split.source_id ?? split.destination_id ?? undefined,
    name: split.category_name ?? split.budget_name ?? undefined,
    description: split.description || undefined,
    totalAmount: toMinorUnits(split.amount),
  }
}

export function transformTransaction(raw: FireflyTransactionResource): Transaction {
  const attrs = raw.attributes
  const splits = attrs.transactions ?? []
  const first = splits[0]

  if (!first) {
    return {
      id: raw.id,
      createdAt: attrs.created_at ? new Date(attrs.created_at) : undefined,
      updatedAt: attrs.updated_at ? new Date(attrs.updated_at) : undefined,
      metadata: raw as unknown as Record<string, unknown>,
    }
  }

  const contacts: TransactionContact[] = []

  if (first.source_id) {
    contacts.push({ id: first.source_id, name: first.source_name ?? undefined })
  }
  if (first.destination_id && first.destination_id !== first.source_id) {
    contacts.push({ id: first.destination_id, name: first.destination_name ?? undefined })
  }

  return {
    id: raw.id,
    accountId: first.source_id ?? undefined,
    splitAccountId: first.destination_id ?? undefined,
    type: first.type || undefined,
    reference: attrs.group_title || undefined,
    memo: first.notes || undefined,
    currency: first.currency_code || undefined,
    totalAmount: toMinorUnits(first.amount),
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: splits.length > 1 ? splits.map(mapLineitem) : undefined,
    createdAt: attrs.created_at ? new Date(attrs.created_at) : undefined,
    updatedAt: attrs.updated_at ? new Date(attrs.updated_at) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
