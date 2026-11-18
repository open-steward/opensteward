import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface QBOJournalLine {
  JournalEntryLineDetail: {
    PostingType: 'Debit' | 'Credit'
    AccountRef: { value: string }
    Entity?: { EntityRef: { value: string } }
  }
  Description: string
  Amount: number
}

export interface QBOJournalEntry {
  Id: string
  TxnDate: string
  DocNumber: string
  Line: QBOJournalLine[]
  [key: string]: unknown
}

function mapLine(line: QBOJournalLine): JournalLineitem {
  const isDebit = line.JournalEntryLineDetail.PostingType === 'Debit'
  return {
    accountId: line.JournalEntryLineDetail.AccountRef?.value || undefined,
    contactId: line.JournalEntryLineDetail.Entity?.EntityRef?.value || undefined,
    description: line.Description || undefined,
    debitAmount: isDebit ? line.Amount : undefined,
    creditAmount: isDebit ? undefined : line.Amount,
  }
}

export function transformJournal(raw: QBOJournalEntry): Journal {
  return {
    id: raw.Id,
    reference: raw.DocNumber || undefined,
    lineItems: (raw.Line ?? []).map(mapLine),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
