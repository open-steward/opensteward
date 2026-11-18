import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AlegraCreditMemoItem {
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

export interface AlegraCreditMemo {
  id: number
  numberTemplate: { number: string; prefix: string }
  date: string
  dueDate: string
  clientId: number
  total: number
  totalTax: number
  balance: number
  paidAmount: number
  currency: string
  status: string
  items: AlegraCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(raw: AlegraCreditMemo): CreditMemoStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'open' || s === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: AlegraCreditMemoItem): Lineitem {
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

export function transformCreditMemo(raw: AlegraCreditMemo): CreditMemo {
  const number = raw.numberTemplate
    ? `${raw.numberTemplate.prefix || ''}${raw.numberTemplate.number}`
    : undefined

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: number,
    contactId: raw.clientId ? String(raw.clientId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.totalTax,
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
    clientId: cm.contactId ? Number(cm.contactId) : undefined,
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
