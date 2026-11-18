import type { Expense } from '../../../schema/expense'

export interface SevDeskPart {
  id: string
  description: string
  accountingType: { id: string } | null
  createDate: string
  currency: string
  sumNet: string
  sumGross: string
  sumTax: string
  [key: string]: unknown
}

export function transformExpense(raw: SevDeskPart): Expense {
  return {
    id: raw.id,
    name: raw.description || undefined,
    accountId: raw.accountingType?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.sumGross) || undefined,
    taxAmount: parseFloat(raw.sumTax) || undefined,
    postedAt: raw.createDate ? new Date(raw.createDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
