import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AppFolioBillLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface AppFolioBill {
  id: string | number
  bill_number: string
  vendor_id: string | number
  property_id: string | number
  date: string
  due_date: string
  amount: number
  tax_amount: number
  currency: string
  status: string
  line_items: AppFolioBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'approved':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'draft':
      return 'DRAFT'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AppFolioBillLineItem): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformBill(raw: AppFolioBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.bill_number || undefined,
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
