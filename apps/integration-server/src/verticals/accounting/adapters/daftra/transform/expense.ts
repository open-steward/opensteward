import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface DaftraExpenseLine {
  ProductId?: string
  Description?: string
  Qty?: number
  UnitPrice?: number
  Total?: number
  TaxRate?: number
  [key: string]: unknown
}

export interface DaftraExpense {
  id: string
  Date?: string
  DueDate?: string
  TaxAmount?: number
  TotalAmount?: number
  SupplierId?: string
  Currency?: string
  Lines?: DaftraExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: DaftraExpenseLine): Lineitem {
  return {
    itemId: line.ProductId ? String(line.ProductId) : undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.Total,
    taxrateId: line.TaxRate !== undefined ? String(line.TaxRate) : undefined,
  }
}

export function transformExpense(raw: DaftraExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.SupplierId ? String(raw.SupplierId) : undefined,
    currency: raw.Currency || undefined,
    taxAmount: raw.TaxAmount,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
