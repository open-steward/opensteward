import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface BlacklineBillLine {
  lineId: string
  description: string
  quantity: number
  unitAmount: number
  totalAmount: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface BlacklineBill {
  reconciliationId: string
  billNumber: string
  status: string
  vendorId: string
  currency: string
  amount: number
  taxAmount: number
  dueDate: string
  postedDate: string
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  lines: BlacklineBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Approved':
    case 'Submitted':
      return 'AUTHORIZED'
    case 'Closed':
      return 'PAID'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: BlacklineBillLine): Lineitem {
  return {
    id: line.lineId,
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount,
    unitQuantity: line.quantity,
    totalAmount: line.totalAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformBill(raw: BlacklineBill): Bill {
  return {
    id: String(raw.reconciliationId),
    status: mapStatus(raw.status),
    billNumber: raw.billNumber || undefined,
    contactId: raw.vendorId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.postedDate ? new Date(raw.postedDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
