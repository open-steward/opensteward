import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface ICountJournalLine {
  account_id?: string
  debit?: number
  credit?: number
  description?: string
  [key: string]: unknown
}

export interface ICountJournal {
  doc_id: string
  date: string
  description?: string
  currency_code?: string
  lines?: ICountJournalLine[]
  [key: string]: unknown
}

function mapLine(line: ICountJournalLine): JournalLineitem {
  return {
    accountId: line.account_id || undefined,
    debitAmount: line.debit,
    creditAmount: line.credit,
    description: line.description || undefined,
  }
}

export function transformJournal(raw: ICountJournal): Journal {
  return {
    id: raw.doc_id,
    description: raw.description as string | undefined,
    currency: raw.currency_code || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
