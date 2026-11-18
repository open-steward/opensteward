import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface MasteraccountingJournalLine {
  id?: string
  accountId?: string
  description?: string
  debitAmount?: number
  creditAmount?: number
  [key: string]: unknown
}

export interface MasteraccountingJournal {
  id: string
  date: string
  reference?: string
  description?: string
  lines?: MasteraccountingJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: MasteraccountingJournalLine): JournalLineitem {
  return {
    id: line.id ? String(line.id) : undefined,
    accountId: line.accountId || undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount || undefined,
    creditAmount: line.creditAmount || undefined,
  }
}

export function transformJournal(raw: MasteraccountingJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
