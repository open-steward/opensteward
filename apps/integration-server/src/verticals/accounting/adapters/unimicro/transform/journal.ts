import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface UnimicroDraftLine {
  ID?: number
  Account?: { AccountNumber?: string }
  Description?: string
  Amount?: number
  Debit?: boolean
  [key: string]: unknown
}

export interface UnimicroJournal {
  ID?: number
  Description?: string
  JournalDate?: string
  DraftLines?: UnimicroDraftLine[]
  [key: string]: unknown
}

function mapLine(line: UnimicroDraftLine): JournalLineitem {
  const amount = line.Amount ?? 0
  return {
    accountId: line.Account?.AccountNumber || undefined,
    description: line.Description || undefined,
    debitAmount: line.Debit ? amount : undefined,
    creditAmount: !line.Debit ? amount : undefined,
  }
}

export function transformJournal(raw: UnimicroJournal): Journal {
  return {
    id: String(raw.ID ?? ''),
    description: raw.Description || undefined,
    lineItems: (raw.DraftLines ?? []).map(mapLine),
    postedAt: raw.JournalDate ? new Date(raw.JournalDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    JournalDate: toCalendarDate(journal.postedAt),
    Description: journal.description,
    DraftLines: journal.lineItems?.map((li) => ({
      Account: li.accountId ? { AccountNumber: li.accountId } : undefined,
      Description: li.description,
      Amount: li.debitAmount ?? li.creditAmount,
      Debit: li.debitAmount !== undefined,
    })),
  }
}
