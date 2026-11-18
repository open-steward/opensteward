import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface CloudMeBillLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface CloudMeBill {
  id: string | number
  invoice_number: string
  invoice_date: string
  due_date: string
  sub_total: number
  tax: number
  total: number
  balance_due: number
  status: string
  vendor_id: string | number
  currency_code: string
  line_items: CloudMeBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: CloudMeBillLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformBill(raw: CloudMeBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.vendor_id ? String(raw.vendor_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    balanceAmount: raw.balance_due,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
