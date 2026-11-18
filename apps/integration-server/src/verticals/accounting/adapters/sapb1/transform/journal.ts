/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SapB1JournalLine {
  Account: string
  Debit: number
  Credit: number
  LineMemo: string
}

export interface SapB1JournalEntry {
  JdtNum: number
  ReferenceDate: string
  Memo: string
  TransactionCode: string
  JournalEntryLines: SapB1JournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: SapB1JournalLine): JournalLineitem {
  return {
    accountId: line.Account || undefined,
    description: line.LineMemo || undefined,
    debitAmount: line.Debit || undefined,
    creditAmount: line.Credit || undefined,
  }
}

export function transformJournal(raw: SapB1JournalEntry): Journal {
  return {
    id: String(raw.JdtNum),
    description: raw.Memo || undefined,
    reference: raw.TransactionCode || undefined,
    lineItems: (raw.JournalEntryLines ?? []).map(mapJournalLine),
    postedAt: raw.ReferenceDate ? new Date(raw.ReferenceDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
