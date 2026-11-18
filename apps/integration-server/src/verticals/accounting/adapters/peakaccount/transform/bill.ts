import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface PeakAccountBillItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface PeakAccountBill {
  id: string | number
  documentNo: string
  status: string
  issueDate: string
  dueDate: string
  totalAmount: number
  vatAmount: number
  currency: string
  contactId: string | number
  items: PeakAccountBillItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'approved':
      return 'AUTHORIZED'
    case 'cancelled':
      return 'VOIDED'
    case 'pending':
    case 'draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: PeakAccountBillItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.accountCode || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.vatAmount || undefined,
  }
}

export function transformBill(raw: PeakAccountBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.documentNo || undefined,
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
