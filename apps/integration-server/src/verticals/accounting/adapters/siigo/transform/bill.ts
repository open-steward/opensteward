import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface SiigoBillItem {
  id: number
  description: string
  quantity: number
  price: number
  total: number
  taxAmount: number
  accountId: number
  productId: string
  discount: number
  [key: string]: unknown
}

export interface SiigoBill {
  id: number
  name: string
  prefix: string
  number: number
  date: string
  dueDate: string
  supplierId: number
  total: number
  taxTotal: number
  balance: number
  currency: string
  status: string
  items: SiigoBillItem[]
  [key: string]: unknown
}

function mapStatus(raw: SiigoBill): BillStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'voided' || s === 'annulled') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: SiigoBillItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.taxAmount || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformBill(raw: SiigoBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.prefix ? `${raw.prefix}-${raw.number}` : String(raw.number),
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    balanceAmount: raw.balance,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    supplierId: bill.contactId ? Number(bill.contactId) : undefined,
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
