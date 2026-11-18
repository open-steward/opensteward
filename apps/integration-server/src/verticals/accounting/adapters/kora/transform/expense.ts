import type { Expense } from '../../../schema/expense'

// Kora does not expose expense reports.
export interface KoraStubExpense {
  [key: string]: unknown
}

export function transformExpense(raw: KoraStubExpense): Expense {
  return {
    metadata: raw as Record<string, unknown>,
  }
}
