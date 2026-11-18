import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface NetSuiteJournalLine {
  id?: string | number
  account?: string | number
  memo?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface NetSuiteJournalEntry {
  id?: string | number
  tranId?: string
  tranDate?: string
  memo?: string
  lines?: NetSuiteJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: NetSuiteJournalLine): JournalLineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account !== undefined ? String(line.account) : undefined,
    description: line.memo || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
  }
}

export function transformJournal(raw: NetSuiteJournalEntry): Journal {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    reference: raw.tranId || undefined,
    description: raw.memo || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
