import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ProsvasisBillLine {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  VatAmount: number
  AccountCode: string
  Discount: number
  [key: string]: unknown
}

export interface ProsvasisBill {
  id: string | number
  SeriesNumber: string
  Status: string
  IssueDate: string
  DueDate: string
  TotalAmount: number
  VatAmount: number
  Currency: string
  SupplierId: string | number
  Lines: ProsvasisBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Issued':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ProsvasisBillLine): Lineitem {
  return {
    id: String(line.Id),
    accountId: line.AccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.VatAmount || undefined,
    discountAmount: line.Discount || undefined,
  }
}

export function transformBill(raw: ProsvasisBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    billNumber: raw.SeriesNumber || undefined,
    contactId: raw.SupplierId ? String(raw.SupplierId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.IssueDate ? new Date(raw.IssueDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
