import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FinancioBillItem {
  id: string | number
  description: string
  qty: number
  unit_price: number
  amount: number
  tax_amount: number
  account_code: string
  tax_rate: number
  discount_amount: number
  [key: string]: unknown
}

export interface FinancioBill {
  id: string | number
  bill_no: string
  bill_date: string
  due_date: string
  sub_total: number
  tax_total: number
  grand_total: number
  outstanding: number
  currency_code: string
  supplier_id: string | number
  supplier_name: string
  status: number
  items: FinancioBillItem[]
  [key: string]: unknown
}

function mapStatus(status: number): BillStatus {
  switch (status) {
    case 1:
      return 'AUTHORIZED'
    case 2:
      return 'PAID'
    case 3:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FinancioBillItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount_amount || undefined,
  }
}

export function transformBill(raw: FinancioBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.bill_no || undefined,
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.grand_total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.outstanding,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
