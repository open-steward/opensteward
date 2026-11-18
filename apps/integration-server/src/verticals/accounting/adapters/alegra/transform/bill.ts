import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AlegraBillItem {
  id: number
  description: string
  quantity: number
  price: number
  total: number
  tax: number
  accountId: number
  productId: string
  discount: number
  [key: string]: unknown
}

export interface AlegraBill {
  id: number
  numberTemplate: { number: string; prefix: string }
  date: string
  dueDate: string
  providerId: number
  total: number
  totalTax: number
  balance: number
  currency: string
  status: string
  items: AlegraBillItem[]
  [key: string]: unknown
}

function mapStatus(raw: AlegraBill): BillStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'open' || s === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: AlegraBillItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformBill(raw: AlegraBill): Bill {
  const number = raw.numberTemplate
    ? `${raw.numberTemplate.prefix || ''}${raw.numberTemplate.number}`
    : undefined

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: number,
    contactId: raw.providerId ? String(raw.providerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.totalTax,
    balanceAmount: raw.balance,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    providerId: bill.contactId ? Number(bill.contactId) : undefined,
    currency: bill.currency,
    date: toCalendarDate(bill.postedAt),
    dueDate: toCalendarDate(bill.dueAt),
    items: bill.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
