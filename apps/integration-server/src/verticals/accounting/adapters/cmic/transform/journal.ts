import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface CmicJournalLine {
  LineId: string
  AccountCode: string
  Description: string
  DebitAmount: number
  CreditAmount: number
  CostCode: string
  [key: string]: unknown
}

export interface CmicJournal {
  JournalId: string
  Description: string
  PostedDate: string
  ProjectCode: string
  Status: string
  Lines: CmicJournalLine[]
  [key: string]: unknown
}

function mapJournalLine(line: CmicJournalLine): JournalLineitem {
  return {
    id: line.LineId,
    accountId: line.AccountCode || undefined,
    description: line.Description || undefined,
    debitAmount: line.DebitAmount || undefined,
    creditAmount: line.CreditAmount || undefined,
  }
}

export function transformJournal(raw: CmicJournal): Journal {
  return {
    id: String(raw.JournalId),
    description: raw.Description || undefined,
    lineItems: (raw.Lines ?? []).map(mapJournalLine),
    postedAt: raw.PostedDate ? new Date(raw.PostedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
