import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface WafeqBillLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  tax_amount?: number
  account_id?: string
  [key: string]: unknown
}

export interface WafeqBill {
  id: string
  number?: string
  date?: string
  due_date?: string
  subtotal?: number
  tax_amount?: number
  total?: number
  amount_due?: number
  status?: string
  contact_id?: string
  currency?: string
  line_items?: WafeqBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'draft':
      return 'DRAFT'
    case 'issued':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: WafeqBillLineItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.tax_amount,
  }
}

export function transformBill(raw: WafeqBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.amount_due,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
