/**
 * Elastic Path Order Transaction → canonical Transaction.
 *
 * Elastic Path transactions are at `/v2/orders/{orderId}/transactions`.
 * Each transaction has a `type` (transaction), `gateway`, `amount`,
 * and a `status` (complete | pending | failed).
 *
 * Transaction kinds map from Elastic Path's type field:
 *   - purchase  → SALE
 *   - authorize → AUTHORIZATION
 *   - capture   → CAPTURE
 *   - refund    → REFUND
 *
 * Money is in integer cents.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEpTransaction {
  id: string
  type: string // transaction
  reference?: string
  gateway?: string
  amount?: number // integer cents
  currency?: string
  transaction_type?: string // purchase | authorize | capture | refund
  status?: string // complete | pending | failed
  relationships?: {
    order?: { data?: { type: string; id: string } }
    [key: string]: unknown
  }
  timestamps?: {
    created_at?: string
    updated_at?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapKind(txType: string | undefined): TransactionKind | undefined {
  switch (txType) {
    case 'purchase':
      return 'SALE'
    case 'authorize':
      return 'AUTHORIZATION'
    case 'capture':
      return 'CAPTURE'
    case 'refund':
      return 'REFUND'
    default:
      return undefined
  }
}

function mapStatus(status: string | undefined): TransactionStatus | undefined {
  switch (status) {
    case 'complete':
      return 'SUCCESS'
    case 'pending':
      return 'PENDING'
    case 'failed':
      return 'FAILURE'
    default:
      return undefined
  }
}

export function transformTransaction(raw: RawEpTransaction, orderId?: string): Transaction {
  const resolvedOrderId = orderId ?? raw.relationships?.order?.data?.id
  return {
    id: raw.id,
    orderId: resolvedOrderId,
    kind: mapKind(raw.transaction_type),
    status: mapStatus(raw.status),
    amount:
      raw.amount != null
        ? { amount: Math.round(raw.amount), currency: raw.currency ?? 'USD' }
        : undefined,
    gateway: raw.gateway,
    authorizationCode: raw.reference,
    createdAt: toIsoDatetime(raw.timestamps?.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
