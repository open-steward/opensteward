import type { Expense } from '../../../schema/expense'

// Sila does not expose expense report endpoints.
export interface SilaStubExpense {
  [key: string]: unknown
}

export function transformExpense(raw: SilaStubExpense): Expense {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
