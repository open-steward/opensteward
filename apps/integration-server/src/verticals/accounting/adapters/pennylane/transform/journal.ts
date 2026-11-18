import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface PennylaneLedgerEvent {
  id: string
  direction: 'debit' | 'credit'
  amount: number
  account_number: string
  label: string
}

export interface PennylaneJournalEntry {
  id: string
  date: string
  label: string
  currency: string
  ledger_events: PennylaneLedgerEvent[]
  [key: string]: unknown
}

function mapLineitem(event: PennylaneLedgerEvent): JournalLineitem {
  return {
    id: event.id,
    accountId: event.account_number || undefined,
    description: event.label || undefined,
    debitAmount: event.direction === 'debit' ? event.amount : undefined,
    creditAmount: event.direction === 'credit' ? event.amount : undefined,
  }
}

export function transformJournal(raw: PennylaneJournalEntry): Journal {
  return {
    id: raw.id,
    description: raw.label || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.ledger_events ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
