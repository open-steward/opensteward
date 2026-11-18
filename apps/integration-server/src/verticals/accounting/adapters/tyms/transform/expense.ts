import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

// ── Tyms wire types ────────────────────────────────────────────────────────────

export interface TymsExpenseItem {
  uuid?: string
  name?: string
  description?: string
  quantity?: number
  price?: number
  amount?: number
  tax?: number
  discount?: number
  account?: string
  [key: string]: unknown
}

export interface TymsExpense {
  uuid: string
  title?: string
  date?: string
  due_date?: string
  amount?: number
  tax?: number | { amount?: number; [key: string]: unknown }
  discount?: number
  currency?: string
  status?: string
  payment_type?: string
  category?: string
  vendor?: {
    uuid?: string
    name?: string
    [key: string]: unknown
  }
  items?: TymsExpenseItem[]
  note?: string
  source_uuid?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Tax amount extraction ──────────────────────────────────────────────────────

function extractTaxAmount(tax: TymsExpense['tax']): number | undefined {
  if (tax === undefined || tax === null) return undefined
  if (typeof tax === 'number') return tax
  return typeof tax.amount === 'number' ? tax.amount : undefined
}

// ── Line-item mapping ──────────────────────────────────────────────────────────

function mapLineitem(item: TymsExpenseItem): Lineitem {
  return {
    id: item.uuid || undefined,
    accountId: item.account || undefined,
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.price ?? undefined,
    unitQuantity: item.quantity ?? undefined,
    totalAmount: item.amount ?? undefined,
    taxAmount: item.tax ?? undefined,
    discountAmount: item.discount ?? undefined,
  }
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformExpense(raw: TymsExpense): Expense {
  return {
    id: raw.uuid,
    name: raw.title || undefined,
    contactId: raw.vendor?.uuid || undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.payment_type || undefined,
    taxAmount: extractTaxAmount(raw.tax),
    totalAmount: raw.amount ?? undefined,
    lineItems: Array.isArray(raw.items) ? raw.items.map(mapLineitem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
