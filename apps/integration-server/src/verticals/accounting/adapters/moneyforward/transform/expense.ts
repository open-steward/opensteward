import type { Expense } from '../../../schema/expense'

// Money Forward does not support expense reports via the invoice API.
// This module is a stub; the adapter does not implement listExpenses / getExpense.

export interface MoneyForwardStubExpense {
  [key: string]: unknown
}

export function transformExpense(_raw: MoneyForwardStubExpense): Expense {
  return {
    metadata: _raw as Record<string, unknown>,
  }
}
