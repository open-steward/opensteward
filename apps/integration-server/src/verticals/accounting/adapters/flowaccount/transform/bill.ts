import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FlowAccountBillItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface FlowAccountBill {
  id: string | number
  documentSerial: string
  statusId: number
  issuedDate: string
  dueDate: string
  amountTotal: number
  vatTotal: number
  currencyCode: string
  contactCode: string
  items: FlowAccountBillItem[]
  [key: string]: unknown
}

function mapStatus(statusId: number): BillStatus {
  switch (statusId) {
    case 3:
      return 'PAID'
    case 5:
      return 'PARTIALLY_PAID'
    case 2:
      return 'AUTHORIZED'
    case 4:
      return 'VOIDED'
    case 1:
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FlowAccountBillItem): Lineitem {
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

export function transformBill(raw: FlowAccountBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statusId),
    billNumber: raw.documentSerial || undefined,
    contactId: raw.contactCode || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amountTotal,
    taxAmount: raw.vatTotal || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issuedDate ? new Date(raw.issuedDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
