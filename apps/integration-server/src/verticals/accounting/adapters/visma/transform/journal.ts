import { toCalendarDate } from '../../shared/transform'
import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface VismaVoucherRow {
  AccountNumber: number
  DebitAmount: number
  CreditAmount: number
  Description: string
  CostCenterItemId1: string
  ProjectId: string
  [key: string]: unknown
}

export interface VismaVoucher {
  Id: string
  Description: string
  VoucherDate: string
  CreatedUtc: string
  ModifiedUtc: string
  Rows: VismaVoucherRow[]
  [key: string]: unknown
}

function mapVoucherRow(row: VismaVoucherRow): JournalLineitem {
  return {
    accountId: row.AccountNumber ? String(row.AccountNumber) : undefined,
    description: row.Description || undefined,
    debitAmount: row.DebitAmount || undefined,
    creditAmount: row.CreditAmount || undefined,
    groupId: row.CostCenterItemId1 || undefined,
    projectId: row.ProjectId || undefined,
  }
}

export function transformJournal(raw: VismaVoucher): Journal {
  return {
    id: raw.Id,
    description: raw.Description || undefined,
    lineItems: (raw.Rows ?? []).map(mapVoucherRow),
    postedAt: raw.VoucherDate ? new Date(raw.VoucherDate) : undefined,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    Description: journal.description,
    VoucherDate: toCalendarDate(journal.postedAt),
    Rows: journal.lineItems?.map((li) => ({
      AccountNumber: li.accountId ? Number(li.accountId) : undefined,
      DebitAmount: li.debitAmount,
      CreditAmount: li.creditAmount,
      Description: li.description,
      CostCenterItemId1: li.groupId,
      ProjectId: li.projectId,
    })),
  }
}
