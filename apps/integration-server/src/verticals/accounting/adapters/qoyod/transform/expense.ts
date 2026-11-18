import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface QoyodSimpleBillLine {
  id?: number | null
  description?: string | null
  amount?: number | null
  tax_amount?: number | null
  account_id?: number | null
  [key: string]: unknown
}

// Qoyod "simple_bills" map to Expenses — lightweight purchase records
export interface QoyodSimpleBill {
  id: number
  reference?: string | null
  vendor_id?: number | null
  date?: string | null
  notes?: string | null
  currency?: string | null
  total?: number | null
  tax_total?: number | null
  lines?: QoyodSimpleBillLine[]
  [key: string]: unknown
}

function mapLine(li: QoyodSimpleBillLine): Lineitem {
  return {
    id: li.id != null ? String(li.id) : undefined,
    accountId: li.account_id != null ? String(li.account_id) : undefined,
    itemDescription: li.description || undefined,
    totalAmount: li.amount ?? undefined,
    taxAmount: li.tax_amount ?? undefined,
  }
}

export function transformExpense(raw: QoyodSimpleBill): Expense {
  return {
    id: String(raw.id),
    name: raw.reference || undefined,
    contactId: raw.vendor_id != null ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.tax_total ?? undefined,
    lineItems: (raw.lines ?? []).map(mapLine),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
