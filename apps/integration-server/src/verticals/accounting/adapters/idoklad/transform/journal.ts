import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface IdokladJournalLine {
  Id?: string | number
  AccountId?: string
  Description?: string
  DebitAmount?: number
  CreditAmount?: number
  TotalAmount?: number
  [key: string]: unknown
}

export interface IdokladJournal {
  Id: string | number
  DateOfPosting?: string
  Description?: string
  DocumentNumber?: string
  CurrencyId?: string
  Items?: IdokladJournalLine[]
  [key: string]: unknown
}

export function transformJournal(raw: IdokladJournal): Journal {
  return {
    id: String(raw.Id),
    description: raw.Description || undefined,
    reference: raw.DocumentNumber || undefined,
    currency: raw.CurrencyId || undefined,
    postedAt: raw.DateOfPosting ? new Date(raw.DateOfPosting) : undefined,
    lineItems: (raw.Items ?? []).map(l => ({
      id: l.Id ? String(l.Id) : undefined,
      accountId: l.AccountId ? String(l.AccountId) : undefined,
      description: l.Description || undefined,
      debitAmount: l.DebitAmount,
      creditAmount: l.CreditAmount,
      totalAmount: l.TotalAmount,
    } satisfies JournalLineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
