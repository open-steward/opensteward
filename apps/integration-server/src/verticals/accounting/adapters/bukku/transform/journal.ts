import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BukkuJournalLine {
  id: string | number
  account_id: string | number
  account_code: string
  account_name: string
  description: string
  debit_amount: number
  credit_amount: number
  [key: string]: unknown
}

export interface BukkuJournal {
  id: string | number
  number: string
  date: string
  description: string
  reference: string
  journal_lines: BukkuJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: BukkuJournalLine): JournalLineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    description: line.description || undefined,
    debitAmount: line.debit_amount || undefined,
    creditAmount: line.credit_amount || undefined,
  }
}

export function transformJournal(raw: BukkuJournal): Journal {
  return {
    id: String(raw.id),
    description: raw.description || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.journal_lines ?? []).map(mapJournalLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
