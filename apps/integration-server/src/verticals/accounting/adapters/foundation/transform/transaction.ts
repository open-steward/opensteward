/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction } from '../../../schema/transaction'

export interface FoundationTransaction {
  TransactionId: string | number
  TransactionDate: string
  Description: string
  Amount: number
  Currency: string
  JobNumber: string
  [key: string]: unknown
}

export function transformTransaction(raw: FoundationTransaction): Transaction {
  return {
    id: String(raw.TransactionId),
    memo: raw.Description || undefined,
    totalAmount: raw.Amount,
    currency: raw.Currency || undefined,
    createdAt: raw.TransactionDate ? new Date(raw.TransactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
