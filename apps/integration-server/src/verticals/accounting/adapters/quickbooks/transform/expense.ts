import type { Expense } from '../../../schema/expense'
import type { TransactionLineitem } from '../../../schema/shared'

export interface QBOExpenseLine {
  Id: string
  Description: string
  Amount: number
  DetailType: string
  AccountBasedExpenseLineDetail?: {
    AccountRef: { value: string }
    UnitPrice?: number
    Qty?: number
  }
}

export interface QBOExpense {
  Id: string
  PaymentType: string
  EntityRef?: { value: string }
  TxnDate: string
  TotalAmt: number
  CurrencyRef?: { value: string }
  AccountRef?: { value: string }
  Line: QBOExpenseLine[]
  [key: string]: unknown
}

function mapLines(lines: QBOExpenseLine[]): TransactionLineitem[] {
  return (lines ?? [])
    .filter((l) => l.DetailType === 'AccountBasedExpenseLineDetail')
    .map((l) => ({
      id: l.Id || undefined,
      accountId: l.AccountBasedExpenseLineDetail?.AccountRef?.value || undefined,
      description: l.Description || undefined,
      unitAmount: l.AccountBasedExpenseLineDetail?.UnitPrice,
      unitQuantity: l.AccountBasedExpenseLineDetail?.Qty,
      totalAmount: l.Amount,
    }))
}

export function transformExpense(raw: QBOExpense): Expense {
  return {
    id: raw.Id,
    contactId: raw.EntityRef?.value || undefined,
    accountId: raw.AccountRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    paymentMethod: raw.PaymentType || undefined,
    totalAmount: raw.TotalAmt,
    lineItems: mapLines(raw.Line ?? []),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
