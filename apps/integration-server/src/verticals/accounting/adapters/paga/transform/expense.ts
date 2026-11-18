import type { Expense } from '../../../schema/expense'

// Paga does not expose expense report endpoints.
export interface PagaStubExpense {
  [key: string]: unknown
}

export function transformExpense(raw: PagaStubExpense): Expense {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
