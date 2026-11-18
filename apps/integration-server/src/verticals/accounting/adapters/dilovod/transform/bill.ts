import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface DilovodBillItem {
  id: string
  name: string
  price: number
  qty: number
  sum: number
  tax_sum?: number
  account_id?: string
  [key: string]: unknown
}

export interface DilovodBill {
  id: string
  number: string
  date: string
  due_date?: string
  total: number
  tax?: number
  status: string
  contractor_id?: string
  currency?: string
  items?: DilovodBillItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'sent':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: DilovodBillItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id || undefined,
    itemDescription: item.name || undefined,
    unitAmount: item.price,
    unitQuantity: item.qty,
    totalAmount: item.sum,
    taxAmount: item.tax_sum || undefined,
  }
}

export function transformBill(raw: DilovodBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.contractor_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
