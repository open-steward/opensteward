import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface SunriseJournalLine {
  id: string
  account_id: string
  description: string
  debit_amount: number
  credit_amount: number
  contact_id: string
  [key: string]: unknown
}

export interface SunriseJournal {
  id: string
  date: string
  description: string
  reference: string
  currency: string
  lines: SunriseJournalLine[]
  [key: string]: unknown
}

function mapLine(row: SunriseJournalLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    contactId: row.contact_id || undefined,
    description: row.description || undefined,
    debitAmount: row.debit_amount || undefined,
    creditAmount: row.credit_amount || undefined,
  }
}

export function transformJournal(raw: SunriseJournal): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
