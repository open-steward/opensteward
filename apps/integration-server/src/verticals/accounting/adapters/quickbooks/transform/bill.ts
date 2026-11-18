import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface QBOBillLine {
  Id: string
  Description: string
  Amount: number
  DetailType: string
  ItemBasedExpenseLineDetail?: { ItemRef: { value: string }; UnitPrice?: number; Qty?: number }
  AccountBasedExpenseLineDetail?: { AccountRef: { value: string }; UnitPrice?: number; Qty?: number }
}

export interface QBOBill {
  Id: string
  DocNumber: string
  VendorRef: { value: string; name: string }
  TxnDate: string
  DueDate: string
  TotalAmt: number
  Balance: number
  CurrencyRef: { value: string }
  Line: QBOBillLine[]
  sparse?: boolean
  [key: string]: unknown
}

function mapStatus(raw: QBOBill): BillStatus {
  if (raw.Balance === 0) return 'PAID'
  if (raw.Balance < raw.TotalAmt) return 'PARTIALLY_PAID'
  if (raw.DueDate && new Date(raw.DueDate).getTime() < Date.now()) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLines(lines: QBOBillLine[]): Lineitem[] {
  return (lines ?? [])
    .filter((l) => l.DetailType === 'ItemBasedExpenseLineDetail' || l.DetailType === 'AccountBasedExpenseLineDetail')
    .map((l) => {
      const detail = l.ItemBasedExpenseLineDetail ?? l.AccountBasedExpenseLineDetail
      return {
        id: l.Id || undefined,
        accountId: (l.AccountBasedExpenseLineDetail?.AccountRef?.value) || undefined,
        itemId: (l.ItemBasedExpenseLineDetail?.ItemRef?.value) || undefined,
        itemDescription: l.Description || undefined,
        unitAmount: detail?.UnitPrice,
        unitQuantity: detail?.Qty,
        totalAmount: l.Amount,
      }
    })
}

export function transformBill(raw: QBOBill): Bill {
  return {
    id: raw.Id,
    status: mapStatus(raw),
    billNumber: raw.DocNumber || undefined,
    contactId: raw.VendorRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    totalAmount: raw.TotalAmt,
    balanceAmount: raw.Balance,
    paidAmount: raw.TotalAmt - raw.Balance || undefined,
    lineItems: mapLines(raw.Line ?? []),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
