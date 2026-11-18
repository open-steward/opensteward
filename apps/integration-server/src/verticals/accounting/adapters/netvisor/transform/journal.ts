import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface NetvisorJournalLine {
  NetvisorKey: number
  AccountNumber: string
  Description: string
  DebitAmount: number
  CreditAmount: number
  [key: string]: unknown
}

export interface NetvisorJournalEntry {
  NetvisorKey: number
  Description: string
  VoucherNumber: number
  Date: string
  Lines: NetvisorJournalLine[]
  [key: string]: unknown
}

function mapLine(row: NetvisorJournalLine): JournalLineitem {
  return {
    id: String(row.NetvisorKey),
    accountId: row.AccountNumber || undefined,
    description: row.Description || undefined,
    debitAmount: row.DebitAmount || undefined,
    creditAmount: row.CreditAmount || undefined,
  }
}

export function transformJournal(raw: NetvisorJournalEntry): Journal {
  return {
    id: String(raw.NetvisorKey),
    description: raw.Description || undefined,
    reference: raw.VoucherNumber ? String(raw.VoucherNumber) : undefined,
    lineItems: (raw.Lines ?? []).map(mapLine),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
