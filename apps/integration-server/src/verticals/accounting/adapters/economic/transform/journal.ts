import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface EconomicJournalEntryLine {
  entryNumber: number
  account: { accountNumber: number; name: string } | null
  amount: number
  amountInBaseCurrency: number
  text: string
  date: string
  [key: string]: unknown
}

export interface EconomicJournalEntry {
  journalNumber: number
  name: string
  entries: EconomicJournalEntryLine[]
  [key: string]: unknown
}

function mapLine(row: EconomicJournalEntryLine): JournalLineitem {
  return {
    id: String(row.entryNumber),
    accountId: row.account?.accountNumber ? String(row.account.accountNumber) : undefined,
    description: row.text || undefined,
    debitAmount: row.amount > 0 ? row.amount : undefined,
    creditAmount: row.amount < 0 ? Math.abs(row.amount) : undefined,
  }
}

export function transformJournal(raw: EconomicJournalEntry): Journal {
  return {
    id: String(raw.journalNumber),
    description: raw.name || undefined,
    lineItems: (raw.entries ?? []).map(mapLine),
    metadata: raw as Record<string, unknown>,
  }
}
