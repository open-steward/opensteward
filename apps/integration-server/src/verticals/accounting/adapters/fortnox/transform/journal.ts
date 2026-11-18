import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { toMinorUnits, fromMinorUnits, toCalendarDate } from '../../shared/transform'

export interface FortnoxVoucherRow {
  Account: number
  Debit: number
  Credit: number
  Description: string
  CostCenter: string
  Project: string
  TransactionInformation: string
  [key: string]: unknown
}

export interface FortnoxVoucher {
  VoucherNumber: number
  VoucherSeries: string
  Description: string
  TransactionDate: string
  Comments: string
  ReferenceNumber: string
  VoucherRows: FortnoxVoucherRow[]
  [key: string]: unknown
}

function mapVoucherRow(row: FortnoxVoucherRow): JournalLineitem {
  return {
    accountId: row.Account ? String(row.Account) : undefined,
    description: row.Description || undefined,
    debitAmount: toMinorUnits(row.Debit) || undefined,
    creditAmount: toMinorUnits(row.Credit) || undefined,
    groupId: row.CostCenter || undefined,
    projectId: row.Project || undefined,
  }
}

export function transformJournal(raw: FortnoxVoucher): Journal {
  return {
    id: `${raw.VoucherSeries}${raw.VoucherNumber}`,
    description: raw.Description || undefined,
    reference: raw.VoucherSeries || undefined,
    lineItems: raw.VoucherRows ? raw.VoucherRows.map(mapVoucherRow) : null,
    postedAt: raw.TransactionDate ? new Date(raw.TransactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    Description: journal.description,
    TransactionDate: toCalendarDate(journal.postedAt),
    VoucherRows: journal.lineItems?.map((li) => ({
      Account: li.accountId ? Number(li.accountId) : undefined,
      Debit: fromMinorUnits(li.debitAmount),
      Credit: fromMinorUnits(li.creditAmount),
      Description: li.description,
      CostCenter: li.groupId,
      Project: li.projectId,
    })),
  }
}
