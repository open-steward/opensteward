/**
 * Maps a Firefly III Transaction (group + splits) to the canonical Journal type.
 *
 * Firefly III does not expose an explicit journal-entry resource.  However,
 * each transaction split carries a debit/credit-like relationship between a
 * source account (credit) and a destination account (debit), which maps
 * naturally to double-entry journal line items.
 *
 * withdrawal  → source asset account credited, destination expense account debited
 * deposit     → source revenue account credited, destination asset account debited
 * transfer    → source asset account credited, destination asset account debited
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import type {
  FireflyTransactionAttributes,
  FireflyTransactionSplit,
} from './transaction'

// Re-export resource shape for use from index.ts
export type { FireflyTransactionAttributes }

export type FireflyJournalResource = {
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

function splitToLines(split: FireflyTransactionSplit): JournalLineitem[] {
  const minorAmount = toMinorUnits(split.amount)

  const lines: JournalLineitem[] = []

  // Credit side — money leaves the source account
  if (split.source_id) {
    lines.push({
      id: split.transaction_journal_id ? `${split.transaction_journal_id}_cr` : undefined,
      accountId: split.source_id,
      description: split.description || undefined,
      creditAmount: minorAmount,
    })
  }

  // Debit side — money enters the destination account
  if (split.destination_id) {
    lines.push({
      id: split.transaction_journal_id ? `${split.transaction_journal_id}_dr` : undefined,
      accountId: split.destination_id,
      description: split.description || undefined,
      debitAmount: minorAmount,
    })
  }

  return lines
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformJournal(raw: FireflyJournalResource): Journal {
  const attrs = raw.attributes
  const splits = attrs.transactions ?? []
  const first = splits[0]

  return {
    id: raw.id,
    description: attrs.group_title || first?.description || undefined,
    reference: attrs.group_title || undefined,
    currency: first?.currency_code || undefined,
    lineItems: splits.flatMap(splitToLines),
    postedAt: first?.date ? new Date(first.date) : undefined,
    createdAt: attrs.created_at ? new Date(attrs.created_at) : undefined,
    updatedAt: attrs.updated_at ? new Date(attrs.updated_at) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
