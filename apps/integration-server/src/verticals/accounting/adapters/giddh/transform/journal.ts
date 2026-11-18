import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface GiddhJournalEntryParticular {
  uniqueName: string
  name: string
  [key: string]: unknown
}

export interface GiddhJournalEntry {
  uniqueName: string
  particular: GiddhJournalEntryParticular
  debit: number
  credit: number
  amount: number
  type: string
  [key: string]: unknown
}

export interface GiddhJournalVoucher {
  uniqueName: string
  number: string
  voucherDate: string
  description: string
  entries: GiddhJournalEntry[]
  [key: string]: unknown
}

function mapLineitem(entry: GiddhJournalEntry): JournalLineitem {
  const isDebit = entry.type === 'DEBIT'
  return {
    accountId: entry.particular?.uniqueName || undefined,
    description: undefined,
    debitAmount: isDebit ? entry.amount : undefined,
    creditAmount: !isDebit ? entry.amount : undefined,
  }
}

export function transformJournal(raw: GiddhJournalVoucher): Journal {
  return {
    id: raw.uniqueName,
    description: raw.description || undefined,
    reference: raw.number || undefined,
    lineItems: (raw.entries ?? []).map(mapLineitem),
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
