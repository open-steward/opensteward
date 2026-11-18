import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface WaveJournalLine {
  id: string
  accountId: string
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface WaveJournal {
  id: string
  entryDate: string
  description: string
  reference: string
  currency: { code: string } | null
  lines: WaveJournalLine[]
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

function mapLine(row: WaveJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
  }
}

export function transformJournal(raw: WaveJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency?.code || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
