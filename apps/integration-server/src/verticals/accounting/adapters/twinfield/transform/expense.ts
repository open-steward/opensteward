import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface TwinfieldExpense {
  code: string
  description: string
  dim1: string
  dim2: string
  currency: string
  valueInc: number
  vatValue: number
  date: string
  [key: string]: unknown
}

export function transformExpense(raw: TwinfieldExpense): Expense {
  return {
    id: raw.code,
    name: raw.description || undefined,
    accountId: raw.dim1 || undefined,
    contactId: raw.dim2 || undefined,
    currency: raw.currency || undefined,
    taxAmount: toMinorUnits(raw.vatValue) || undefined,
    totalAmount: toMinorUnits(raw.valueInc),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
