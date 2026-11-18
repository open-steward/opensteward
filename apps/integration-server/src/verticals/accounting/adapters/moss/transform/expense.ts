import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

// ── Moss Money ───────────────────────────────────────────────────────────────

export interface MossMoney {
  amount: string
  currency: string
}

// ── Moss ExpenseLine ─────────────────────────────────────────────────────────

export interface MossExpenseLine {
  id: string
  expenseType?: string
  expenseSubType?: string | null
  bookingText?: string | null
  description?: string | null
  expenseAccountId?: string | null
  taxRateId?: string | null
  netAmount?: MossMoney | null
  vatAmount?: MossMoney | null
  grossAmount?: MossMoney | null
  amount?: MossMoney | null
  homeAmount?: MossMoney | null
  quantity?: number | null
  unitPrice?: MossMoney | null
  [key: string]: unknown
}

// ── Moss Expense ─────────────────────────────────────────────────────────────

export interface MossExpense {
  id: string
  expenseType?: string
  expenseSubType?: string | null
  bookingText?: string | null
  description?: string | null
  createTime: string
  updateTime: string
  expenseTime: string
  organisationId?: string
  createdBy?: string
  supplierId?: string | null
  homeAmount?: MossMoney | null
  status?: string | null
  lines?: MossExpenseLine[]
  expenseMetadata?: Record<string, unknown> | null
  exportMetadata?: Record<string, unknown> | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMoney(money?: MossMoney | null): number | undefined {
  if (!money?.amount || typeof money.amount !== 'string') return undefined
  const n = parseFloat(money.amount)
  return isNaN(n) ? undefined : Math.round(n * 100)
}

function mapLineitem(line: MossExpenseLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.expenseAccountId || undefined,
    itemDescription: line.description || line.bookingText || undefined,
    taxrateId: line.taxRateId || undefined,
    unitAmount: parseMoney(line.unitPrice),
    unitQuantity: typeof line.quantity === 'number' ? line.quantity : undefined,
    taxAmount: parseMoney(line.vatAmount),
    totalAmount: parseMoney(line.grossAmount ?? line.amount ?? line.homeAmount),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformExpense(raw: MossExpense): Expense {
  const lines = raw.lines ?? []
  const vatTotal = lines.reduce((sum, l) => sum + (parseMoney(l.vatAmount) ?? 0), 0) || undefined

  return {
    id: raw.id,
    name: raw.description || raw.bookingText || undefined,
    contactId: raw.supplierId || undefined,
    userId: raw.createdBy || undefined,
    currency: raw.homeAmount?.currency || undefined,
    totalAmount: parseMoney(raw.homeAmount),
    taxAmount: vatTotal,
    lineItems: lines.length > 0 ? lines.map(mapLineitem) : undefined,
    postedAt: raw.expenseTime ? new Date(raw.expenseTime) : undefined,
    createdAt: raw.createTime ? new Date(raw.createTime) : undefined,
    updatedAt: raw.updateTime ? new Date(raw.updateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
