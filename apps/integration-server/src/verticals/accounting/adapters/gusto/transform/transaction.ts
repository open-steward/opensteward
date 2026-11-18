import type { Transaction } from '../../../schema/transaction'

export interface GustoTransaction {
  id: string | number
  date: string
  description: string
  amount: number
  currency?: string
  employee_id?: string | number
  payroll_run_id?: string | number
  [key: string]: unknown
}

export function transformTransaction(raw: GustoTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description || undefined,
    totalAmount: raw.amount,
    currency: raw.currency || 'USD',
    contacts: raw.employee_id ? [{ id: String(raw.employee_id) }] : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
