import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface MasteraccountingBillLine {
  id: string
  description?: string
  unitPrice: number
  quantity: number
  amount: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface MasteraccountingBill {
  id: string
  number: string
  date: string
  dueDate?: string
  totalSum: number
  taxSum?: number
  status: string
  partnerId?: string
  currency?: string
  lines?: MasteraccountingBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'APPROVED':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    case 'DRAFT':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MasteraccountingBillLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformBill(raw: MasteraccountingBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.partnerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalSum,
    taxAmount: raw.taxSum || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
