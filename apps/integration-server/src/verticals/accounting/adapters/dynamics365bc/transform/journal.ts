import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BCJournalLine {
  id: string
  journalDisplayName: string
  lineNumber: number
  accountType: string
  accountId?: string
  accountNumber?: string
  postingDate?: string
  documentNumber?: string
  description?: string
  debitAmount?: number
  creditAmount?: number
  amount?: number
  [key: string]: unknown
}

export interface BCJournalEntry {
  id: string
  code: string
  displayName: string
  lastModifiedDateTime?: string
  journalLines?: BCJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: BCJournalLine): JournalLineitem {
  return {
    id: line.id,
    accountId: line.accountId || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount || undefined,
    creditAmount: line.creditAmount || undefined,
    totalAmount: line.amount,
  }
}

export function transformJournal(raw: BCJournalEntry): Journal {
  const firstLine = raw.journalLines?.[0]
  return {
    id: raw.id,
    description: raw.displayName || undefined,
    reference: raw.code || undefined,
    lineItems: (raw.journalLines ?? []).map(mapLineitem),
    postedAt: firstLine?.postingDate ? new Date(firstLine.postingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
