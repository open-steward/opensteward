import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface SiigoCreditMemoItem {
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

export interface SiigoCreditMemo {
  id: number
  prefix: string
  number: number
  date: string
  dueDate: string
  customerId: number
  total: number
  taxTotal: number
  balance: number
  paidAmount: number
  currency: string
  status: string
  items: SiigoCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(raw: SiigoCreditMemo): CreditMemoStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'voided' || s === 'annulled') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: SiigoCreditMemoItem): Lineitem {
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

export function transformCreditMemo(raw: SiigoCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.prefix ? `${raw.prefix}-${raw.number}` : String(raw.number),
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    customerId: cm.contactId ? Number(cm.contactId) : undefined,
    currency: cm.currency,
    date: toCalendarDate(cm.postedAt),
    dueDate: toCalendarDate(cm.dueAt),
    items: cm.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
