import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

export interface FreeAgentExpense {
  url: string
  user: string
  category: string
  description: string
  dated_on: string
  currency: string
  gross_value: string
  sales_tax_value: string
  native_gross_value: string
  attachment_url: string
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

export function transformExpense(raw: FreeAgentExpense): Expense {
  return {
    id: extractId(raw.url),
    name: raw.description || undefined,
    userId: raw.user ? extractId(raw.user) : undefined,
    currency: raw.currency || undefined,
    taxAmount: toMinorUnits(raw.sales_tax_value) || undefined,
    totalAmount: toMinorUnits(raw.gross_value) || undefined,
    postedAt: raw.dated_on ? new Date(raw.dated_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
