import type { Expense } from '../../../schema/expense'

export interface IntacctExpense {
  RECORDNO: string
  EMPLOYEEID: string
  DESCRIPTION: string
  WHENCREATED: string
  CURRENCY: string
  TOTALENTERED: string
  TOTALPAID: string
  STATE: 'Draft' | 'Submitted' | 'Approved' | 'Paid' | 'Reversed'
  [key: string]: unknown
}

export function transformExpense(raw: IntacctExpense): Expense {
  return {
    id: raw.RECORDNO,
    name: raw.DESCRIPTION || undefined,
    userId: raw.EMPLOYEEID || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.TOTALENTERED),
    postedAt: raw.WHENCREATED ? new Date(raw.WHENCREATED) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
