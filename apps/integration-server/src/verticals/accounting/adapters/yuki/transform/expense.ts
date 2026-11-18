/**
 * Yuki does not expose expenses via its standard SOAP API.
 * This file is retained as a placeholder; the adapter does not implement
 * expense operations — they auto-501 via the framework default.
 */

import type { Expense } from '../../../schema/expense'

export interface YukiExpense {
  [key: string]: unknown
}

export function transformExpense(_raw: YukiExpense): Expense {
  throw new Error('Yuki: expense endpoint is not available in the SOAP API')
}
