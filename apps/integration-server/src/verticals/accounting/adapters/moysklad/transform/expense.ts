import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface MoyskladExpenseLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  sum?: number
  vat?: number
  account?: { meta?: { href?: string } }
  [key: string]: unknown
}

export interface MoyskladExpense {
  id?: string
  moment?: string
  sum?: number
  vatSum?: number
  currency?: { name?: string }
  agent?: { meta?: { href?: string } }
  expenseAccount?: { meta?: { href?: string } }
  positions?: { rows?: MoyskladExpenseLine[] }
  [key: string]: unknown
}

function getLastSegment(href?: string): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformExpense(raw: MoyskladExpense): Expense {
  return {
    id: raw.id ? String(raw.id) : '',
    contactId: getLastSegment(raw.agent?.meta?.href),
    accountId: getLastSegment(raw.expenseAccount?.meta?.href),
    currency: raw.currency?.name || undefined,
    totalAmount: raw.sum != null ? raw.sum / 100 : undefined,
    taxAmount: raw.vatSum != null ? raw.vatSum / 100 : undefined,
    postedAt: raw.moment ? new Date(raw.moment) : undefined,
    lineItems: (raw.positions?.rows ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price != null ? l.price / 100 : undefined,
      unitQuantity: l.quantity,
      totalAmount: l.sum != null ? l.sum / 100 : undefined,
      taxAmount: l.vat != null ? l.vat / 100 : undefined,
      accountId: getLastSegment(l.account?.meta?.href),
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
