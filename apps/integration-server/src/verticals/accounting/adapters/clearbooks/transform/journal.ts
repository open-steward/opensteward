import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ClearBooksJournalLine {
  id: string | number
  account_code: string
  description: string
  debit: number
  credit: number
  [key: string]: unknown
}

export interface ClearBooksJournal {
  journal_id: string | number
  date: string
  description: string
  lines: ClearBooksJournalLine[]
  [key: string]: unknown
}

function parseUkDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/')
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }
  return new Date(dateStr)
}

function mapJournalLine(line: ClearBooksJournalLine): JournalLineitem {
  return {
    id: String(line.id),
    accountId: line.account_code || undefined,
    description: line.description || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: ClearBooksJournal): Journal {
  return {
    id: String(raw.journal_id),
    description: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapJournalLine),
    postedAt: parseUkDate(raw.date as string),
    metadata: raw as Record<string, unknown>,
  }
}
