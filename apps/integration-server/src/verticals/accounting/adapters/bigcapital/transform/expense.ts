import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

/**
 * Convert a Bigcapital float major-unit amount to integer minor units (cents).
 * Returns undefined when the value is not a finite number.
 */
function toMinor(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.round(value * 100)
}

export interface BigcapitalExpenseCategory {
  id?: number
  amount?: number
  expenseAccountId?: number
  description?: string
  projectId?: number
  [key: string]: unknown
}

export interface BigcapitalExpense {
  id: number
  referenceNo?: string
  payeeId?: number
  paymentAccountId?: number
  userId?: number
  currencyCode?: string
  description?: string
  totalAmount?: number
  isPublished?: boolean
  paymentDate?: string
  publishedAt?: string
  categories?: BigcapitalExpenseCategory[]
  createdAt?: string
  [key: string]: unknown
}

function mapCategory(cat: BigcapitalExpenseCategory): Lineitem {
  return {
    id: cat.id != null ? String(cat.id) : undefined,
    accountId: cat.expenseAccountId != null ? String(cat.expenseAccountId) : undefined,
    itemDescription: cat.description || undefined,
    totalAmount: toMinor(cat.amount),
  }
}

export function transformExpense(raw: BigcapitalExpense): Expense {
  return {
    id: String(raw.id),
    accountId: raw.paymentAccountId != null ? String(raw.paymentAccountId) : undefined,
    contactId: raw.payeeId != null ? String(raw.payeeId) : undefined,
    userId: raw.userId != null ? String(raw.userId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: toMinor(raw.totalAmount),
    lineItems: (raw.categories ?? []).map(mapCategory),
    postedAt: raw.paymentDate ? new Date(raw.paymentDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Expense → Bigcapital request body (for create)
// Canonical amounts are integer minor units; Bigcapital expects major-unit floats.
export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    paymentAccountId: expense.accountId != null ? Number(expense.accountId) : undefined,
    payeeId: expense.contactId != null ? Number(expense.contactId) : undefined,
    currencyCode: expense.currency,
    paymentDate: toCalendarDate(expense.postedAt),
    description: expense.name,
    categories: expense.lineItems?.map((li) => ({
      expenseAccountId: li.accountId != null ? Number(li.accountId) : undefined,
      description: li.itemDescription,
      amount: li.totalAmount != null ? li.totalAmount / 100 : undefined,
    })),
  }
}
