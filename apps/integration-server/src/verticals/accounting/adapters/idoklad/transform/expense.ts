import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface IdokladExpenseLine {
  Id: string | number
  Name?: string
  UnitPrice?: number
  Amount?: number
  TotalWithVat?: number
  VatAmount?: number
  AccountNumber?: string
  [key: string]: unknown
}

export interface IdokladExpense {
  Id: string | number
  DateOfIssue?: string
  TotalWithVat?: number
  TotalVatAmount?: number
  CurrencyId?: string
  ClientId?: string | number
  AccountId?: string
  Items?: IdokladExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: IdokladExpense): Expense {
  return {
    id: String(raw.Id),
    contactId: raw.ClientId ? String(raw.ClientId) : undefined,
    accountId: raw.AccountId ? String(raw.AccountId) : undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: raw.TotalWithVat,
    taxAmount: raw.TotalVatAmount,
    postedAt: raw.DateOfIssue ? new Date(raw.DateOfIssue) : undefined,
    lineItems: (raw.Items ?? []).map(l => ({
      id: String(l.Id),
      itemDescription: l.Name || undefined,
      unitAmount: l.UnitPrice,
      unitQuantity: l.Amount,
      totalAmount: l.TotalWithVat,
      taxAmount: l.VatAmount,
      accountId: l.AccountNumber ? String(l.AccountNumber) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
