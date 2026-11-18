/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface DebitoorTransaction {
  id: string
  accountId: string
  type: string
  reference: string
  currency: string
  amount: number
  date: string
  description: string
  [key: string]: unknown
}

export function transformTransaction(raw: DebitoorTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.accountId || undefined,
      description: raw.description || undefined,
      totalAmount: raw.amount,
    },
  ]
  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    lineItems,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
