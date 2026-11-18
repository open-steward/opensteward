/**
 * Manager payments → canonical Transaction transform.
 *
 * API endpoint: GET /api2/payments
 *
 * Manager amounts are plain floats in the document currency.
 * Canonical Amount is z.number().int() (minor units / cents), so all floats
 * must be multiplied by 100 and rounded before being stored.
 *
 * sortBy values: Date, Cleared, Reference, PaidFrom, Description, Payee,
 *                Accounts, Project, Amount, Timestamp
 */
import type { Transaction } from '../../../schema/transaction'
import type { TransactionContact } from '../../../schema/transaction'

/** Convert a Manager decimal float (e.g. 125.50) to integer minor units (12550). */
function toMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

export interface ManagerPayment {
  key?: string
  date?: string
  reference?: string
  paidFrom?: string
  description?: string
  payee?: string
  amount?: { value?: number; currency?: string | null }
  cleared?: boolean
  [key: string]: unknown
}

export function transformTransaction(raw: ManagerPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.payee) contacts.push({ name: raw.payee })

  return {
    id: raw.key,
    accountId: raw.paidFrom || undefined,
    type: 'PAYMENT',
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    totalAmount: toMinorUnits(raw.amount?.value),
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
