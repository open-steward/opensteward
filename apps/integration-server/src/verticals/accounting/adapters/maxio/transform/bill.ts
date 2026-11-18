import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface MaxioBillLineItem {
  uid: string
  title: string
  description: string
  quantity: string
  unit_price: string
  subtotal_amount: string
  tax_amount: string
  [key: string]: unknown
}

export interface MaxioBill {
  uid: string
  number: string
  state: string
  created_at: string
  due_date: string
  currency: string
  total_amount: string
  tax_amount: string
  paid_amount: string
  due_amount: string
  vendor_id: number | null
  line_items: MaxioBillLineItem[]
  [key: string]: unknown
}

function mapStatus(state: string): BillStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
    case 'canceled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MaxioBillLineItem): Lineitem {
  return {
    id: line.uid,
    itemDescription: line.title || line.description || undefined,
    unitAmount: parseFloat(line.unit_price) || 0,
    unitQuantity: parseFloat(line.quantity) || 1,
    totalAmount: parseFloat(line.subtotal_amount) || 0,
    taxAmount: parseFloat(line.tax_amount) || undefined,
  }
}

export function transformBill(raw: MaxioBill): Bill {
  return {
    id: raw.uid,
    status: mapStatus(raw.state),
    billNumber: raw.number || undefined,
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_amount) || 0,
    taxAmount: parseFloat(raw.tax_amount) || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.created_at ? new Date(raw.created_at) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
