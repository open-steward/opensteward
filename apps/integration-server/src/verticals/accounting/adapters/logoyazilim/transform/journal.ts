import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface LogoJournalLine {
  id?: string
  AccountCode?: string
  Debit?: number
  Credit?: number
  Description?: string
  [key: string]: unknown
}

export interface LogoJournal {
  id: string
  Date?: string
  Description?: string
  Lines?: LogoJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: LogoJournal): Journal {
  const lineItems: JournalLineitem[] = (raw.Lines ?? []).map((line, idx) => ({
    id: line.id ? String(line.id) : String(idx),
    accountId: line.AccountCode || undefined,
    description: line.Description || undefined,
    debitAmount: line.Debit,
    creditAmount: line.Credit,
  }))
  return {
    id: String(raw.id),
    description: raw.Description || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
