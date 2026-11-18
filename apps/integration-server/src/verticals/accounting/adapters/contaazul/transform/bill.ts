import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ContaAzulBillItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string
  product_id: string
  discount: number
  [key: string]: unknown
}

export interface ContaAzulBill {
  id: string
  number: string
  issue_date: string
  due_date: string
  supplier_id: string
  total: number
  tax_total: number
  balance: number
  currency: string
  status: string
  items: ContaAzulBillItem[]
  [key: string]: unknown
}

function mapStatus(raw: ContaAzulBill): BillStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'voided' || s === 'cancelled') return 'VOIDED'
  if (s === 'paid' || s === 'liquidated') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'confirmed') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: ContaAzulBillItem): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemId: row.product_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformBill(raw: ContaAzulBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.balance,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    supplier_id: bill.contactId,
    currency: bill.currency,
    issue_date: toCalendarDate(bill.postedAt),
    due_date: toCalendarDate(bill.dueAt),
    items: bill.lineItems?.map((li) => ({
      product_id: li.itemId,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
