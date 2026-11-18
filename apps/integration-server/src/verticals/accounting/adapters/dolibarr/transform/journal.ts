import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface DolibarrJournalLine {
  id?: number | string
  fk_account?: number | string
  account_ref?: string
  label?: string
  debit?: number
  credit?: number
  [key: string]: unknown
}

export interface DolibarrJournal {
  id?: number | string
  rowid?: number | string
  date_creation?: number | string
  label?: string
  ref?: string
  lines?: DolibarrJournalLine[]
  [key: string]: unknown
}

function mapLineitem(line: DolibarrJournalLine): JournalLineitem {
  return {
    accountId: line.fk_account !== undefined ? String(line.fk_account) : line.account_ref || undefined,
    description: line.label || undefined,
    debitAmount: line.debit || undefined,
    creditAmount: line.credit || undefined,
  }
}

export function transformJournal(raw: DolibarrJournal): Journal {
  const id = raw.rowid ?? raw.id
  return {
    id: id !== undefined ? String(id) : '',
    description: raw.label || undefined,
    reference: raw.ref || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date_creation ? new Date(Number(raw.date_creation) * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
