import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface HinawiExpenseLineItem {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  Total: number
  TaxAmount: number
  AccountId: string | number
  [key: string]: unknown
}

export interface HinawiExpense {
  id: string | number
  Date: string
  Total: number
  TaxAmount: number
  Currency: string
  AccountId: string | number
  ContactId: string | number
  Description: string
  LineItems: HinawiExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: HinawiExpenseLineItem): Lineitem {
  return {
    id: String(item.Id),
    accountId: item.AccountId ? String(item.AccountId) : undefined,
    itemDescription: item.Description || undefined,
    unitAmount: item.UnitPrice,
    unitQuantity: item.Quantity,
    totalAmount: item.Total,
    taxAmount: item.TaxAmount || undefined,
  }
}

export function transformExpense(raw: HinawiExpense): Expense {
  return {
    id: String(raw.id),
    accountId: raw.AccountId ? String(raw.AccountId) : undefined,
    contactId: raw.ContactId ? String(raw.ContactId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    taxAmount: raw.TaxAmount || undefined,
    lineItems: (raw.LineItems ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
