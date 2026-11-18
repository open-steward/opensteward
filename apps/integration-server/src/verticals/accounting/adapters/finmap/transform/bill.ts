import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FinmapBillItem {
  id: string
  name: string
  price: number
  count: number
  total: number
  tax?: number
  [key: string]: unknown
}

export interface FinmapBill {
  id: string
  name: string
  date: string
  dueDate?: string
  amount: number
  amountWithTax?: number
  taxAmount?: number
  status: string
  counterpartyId?: string
  currency?: string
  items?: FinmapBillItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'active':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'deleted':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FinmapBillItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.count,
    totalAmount: item.total,
    taxAmount: item.tax || undefined,
  }
}

export function transformBill(raw: FinmapBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.name || undefined,
    contactId: raw.counterpartyId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amountWithTax ?? raw.amount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
