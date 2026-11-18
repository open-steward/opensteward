import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface TwinfieldJournalLine {
  id: string
  dim1: string
  dim2: string
  description: string
  debitCredit: string
  value: number
  vatValue: number
  [key: string]: unknown
}

export interface TwinfieldJournal {
  code: string
  number: string
  date: string
  description: string
  currency: string
  lines: TwinfieldJournalLine[]
  [key: string]: unknown
}

function mapLine(row: TwinfieldJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.dim1 || undefined,
    contactId: row.dim2 || undefined,
    description: row.description || undefined,
    debitAmount: row.debitCredit === 'debit' ? row.value : undefined,
    creditAmount: row.debitCredit === 'credit' ? row.value : undefined,
    taxAmount: row.vatValue || undefined,
  }
}

export function transformJournal(raw: TwinfieldJournal): Journal {
  return {
    id: raw.code,
    description: raw.description || undefined,
    reference: raw.number || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
