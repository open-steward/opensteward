import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface BillyDaybookTransactionLine {
  id: string
  accountId: string
  description: string
  debit: number
  credit: number
  taxAmount: number
  contactId: string
  [key: string]: unknown
}

export interface BillyDaybookTransaction {
  id: string
  entryDate: string
  description: string
  voucherNo: string
  daybookTransactionLines: BillyDaybookTransactionLine[]
  [key: string]: unknown
}

function mapLine(row: BillyDaybookTransactionLine): JournalLineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    contactId: row.contactId || undefined,
    description: row.description || undefined,
    debitAmount: row.debit || undefined,
    creditAmount: row.credit || undefined,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformJournal(raw: BillyDaybookTransaction): Journal {
  return {
    id: raw.id,
    description: raw.description || undefined,
    reference: raw.voucherNo || undefined,
    lineItems: (raw.daybookTransactionLines ?? []).map(mapLine),
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
