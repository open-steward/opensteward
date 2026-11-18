import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AccountsIQBillLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface AccountsIQBill {
  billId: string | number
  entityId: string | number
  status: string
  billNumber: string
  billDate: string
  dueDate: string
  totalAmount: number
  taxAmount: number
  currency: string
  contactId: string | number
  lines: AccountsIQBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Posted':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AccountsIQBillLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformBill(raw: AccountsIQBill): Bill {
  return {
    id: String(raw.billId),
    status: mapStatus(raw.status),
    billNumber: raw.billNumber || undefined,
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
