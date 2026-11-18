import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface TorgsoftBillItem {
  id: string
  title: string
  price: number
  quantity: number
  total: number
  tax?: number
  account_id?: string
  [key: string]: unknown
}

export interface TorgsoftBill {
  id: string
  invoice_number: string
  invoice_date: string
  due_date?: string
  total_amount: number
  tax_amount?: number
  status: string
  client_id?: string
  currency?: string
  items?: TorgsoftBillItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'confirmed':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    case 'new':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: TorgsoftBillItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id || undefined,
    itemDescription: item.title || undefined,
    unitAmount: item.price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax || undefined,
  }
}

export function transformBill(raw: TorgsoftBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.client_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
