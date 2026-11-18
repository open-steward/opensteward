import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ZohoBooksBillLineItem {
  line_item_id: string
  item_id: string
  description: string
  rate: number
  quantity: number
  item_total: number
  tax_amount: number
  account_id: string
}

export interface ZohoBooksBill {
  bill_id: string
  bill_number: string
  vendor_id: string
  date: string
  due_date: string
  currency_code: string
  total: number
  balance: number
  tax_total: number
  status: 'draft' | 'open' | 'overdue' | 'paid' | 'void' | 'partially_paid'
  line_items?: ZohoBooksBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status: ZohoBooksBill['status']): BillStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'overdue': return 'OVERDUE'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    case 'partially_paid': return 'PARTIALLY_PAID'
    default: return 'DRAFT'
  }
}

function mapLineItem(li: ZohoBooksBillLineItem): Lineitem {
  return {
    id: li.line_item_id || undefined,
    itemId: li.item_id || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.rate,
    unitQuantity: li.quantity,
    totalAmount: li.item_total,
    taxAmount: li.tax_amount || undefined,
    accountId: li.account_id || undefined,
  }
}

export function transformBill(raw: ZohoBooksBill): Bill {
  return {
    id: raw.bill_id,
    status: mapStatus(raw.status),
    billNumber: raw.bill_number || undefined,
    contactId: raw.vendor_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.balance,
    paidAmount: raw.total - raw.balance || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
