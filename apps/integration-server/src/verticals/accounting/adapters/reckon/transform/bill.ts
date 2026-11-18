import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonBillLineItem {
  id: string
  description: string
  quantity: number
  unitAmount: number
  amount: number
  taxAmount: number
  accountId: string
  accountName: string
  taxCodeId: string
  discountAmount: number
  [key: string]: unknown
}

export interface ReckonBill {
  id: string
  billNumber: string
  date: string
  dueDate: string
  totalAmount: number
  totalTax: number
  balance: number
  subTotal: number
  currencyCode: string
  contactId: string
  contactName: string
  status: string
  lineItems: ReckonBillLineItem[]
  reference: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status?.toUpperCase()) {
    case 'DRAFT':
      return 'DRAFT'
    case 'OPEN':
      return 'AUTHORIZED'
    case 'PARTIAL':
      return 'PARTIALLY_PAID'
    case 'PAID':
      return 'PAID'
    case 'VOID':
      return 'VOIDED'
    case 'OVERDUE':
      return 'OVERDUE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: ReckonBillLineItem): Lineitem {
  return {
    id: item.id || undefined,
    accountId: item.accountId || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unitAmount,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.taxAmount || undefined,
    taxrateId: item.taxCodeId || undefined,
    discountAmount: item.discountAmount || undefined,
  }
}

export function transformBill(raw: ReckonBill): Bill {
  const paidAmount = raw.totalAmount != null && raw.balance != null
    ? raw.totalAmount - raw.balance
    : undefined

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.billNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.totalTax || undefined,
    balanceAmount: raw.balance,
    paidAmount: paidAmount && paidAmount > 0 ? paidAmount : undefined,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
