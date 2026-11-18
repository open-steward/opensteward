import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface SpeedLedgerExpenseLine {
  id?: number | string
  description?: string
  amount?: number
  vatAmount?: number
  accountNumber?: string | number
  [key: string]: unknown
}

export interface SpeedLedgerExpense {
  id: number | string
  description?: string
  date?: string
  currency?: string
  totalInclVat?: number
  totalVat?: number
  status?: string
  lines?: SpeedLedgerExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: SpeedLedgerExpenseLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.accountNumber !== undefined ? String(line.accountNumber) : undefined,
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
    taxAmount: line.vatAmount || undefined,
  }
}

export function transformExpense(raw: SpeedLedgerExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalInclVat,
    taxAmount: raw.totalVat || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
