/**
 * Refrens transaction transform.
 *
 * Refrens does not document a dedicated transactions/payments-list endpoint.
 * Payment updates are sent as PATCH to an existing invoice; there is no
 * standalone transaction resource. This file is present for interface
 * completeness; the adapter does not implement listTransactions / getTransaction.
 */

import type { Transaction } from '../../../schema/transaction'

// Placeholder shape
export interface RefrensTransaction {
  _id: string
  [key: string]: unknown
}

export function transformTransaction(raw: RefrensTransaction): Transaction {
  return {
    id: raw._id,
    metadata: raw as Record<string, unknown>,
  }
}
