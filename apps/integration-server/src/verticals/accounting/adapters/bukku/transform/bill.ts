import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface BukkuBillLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string | number
  account_code: string
  tax_rate_id: string | number
  discount: number
  [key: string]: unknown
}

export interface BukkuBill {
  id: string | number
  number: string
  date: string
  due_date: string
  total: number
  tax_total: number
  balance_due: number
  sub_total: number
  currency_code: string
  contact_id: string | number
  contact_name: string
  status: string
  line_items: BukkuBillLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'received':
      return 'AUTHORIZED'
    case 'overdue':
      return 'OVERDUE'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: BukkuBillLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount || undefined,
  }
}

export function transformBill(raw: BukkuBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.number || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.balance_due,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
