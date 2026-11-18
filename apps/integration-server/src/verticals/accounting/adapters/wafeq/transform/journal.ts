import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface WafeqJournalLine {
  account_id?: string
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface WafeqJournal {
  id: string
  date?: string
  description?: string
  reference?: string
  lines?: WafeqJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: WafeqJournalLine): JournalLineitem {
  return {
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
  }
}

export function transformJournal(raw: WafeqJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
