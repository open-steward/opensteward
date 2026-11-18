/**
 * Sylius Payment -> canonical Transaction.
 *
 * Sylius payments live under `/api/v2/admin/payments` and track monetary
 * movements on an order. Each payment has:
 *  - `state`: new | processing | completed | failed | cancelled | refunded
 *  - `amount` in **cents**
 *  - `method` (payment method)
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'

export interface RawSyliusPayment {
  id: number | string
  order?: { id?: number | string; number?: string } | string | null
  state?: string
  amount?: number // cents
  currencyCode?: string
  method?: { code?: string; name?: string } | string | null
  details?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function centsToDecimal(cents: number | null | undefined): number {
  // Sylius reports money in integer minor units (cents) — already canonical.
  if (cents == null) return 0
  return Math.round(cents)
}

function mapKind(state: string | undefined): TransactionKind | undefined {
  switch (state) {
    case 'new':
    case 'processing':
      return 'AUTHORIZATION'
    case 'completed':
      return 'CAPTURE'
    case 'cancelled':
      return 'VOID'
    case 'refunded':
      return 'REFUND'
    default:
      return 'SALE'
  }
}

function mapStatus(state: string | undefined): TransactionStatus | undefined {
  switch (state) {
    case 'completed':
      return 'SUCCESS'
    case 'new':
    case 'processing':
      return 'PENDING'
    case 'failed':
      return 'FAILURE'
    case 'cancelled':
      return 'SUCCESS'
    case 'refunded':
      return 'SUCCESS'
    default:
      return undefined
  }
}

function extractOrderId(
  order: { id?: number | string; number?: string } | string | null | undefined,
): string | undefined {
  if (!order) return undefined
  if (typeof order === 'string') {
    const parts = order.split('/')
    return parts[parts.length - 1]
  }
  return order.id != null ? String(order.id) : undefined
}

function extractMethodName(
  method: { code?: string; name?: string } | string | null | undefined,
): string | undefined {
  if (!method) return undefined
  if (typeof method === 'string') return method
  return method.name ?? method.code ?? undefined
}

export function transformTransaction(raw: RawSyliusPayment): Transaction {
  const currency = raw.currencyCode ?? 'USD'
  return {
    id: String(raw.id),
    orderId: extractOrderId(raw.order),
    kind: mapKind(raw.state),
    status: mapStatus(raw.state),
    amount: raw.amount != null ? { amount: centsToDecimal(raw.amount), currency } : undefined,
    gateway: extractMethodName(raw.method),
    processedAt: raw.createdAt,
    createdAt: raw.createdAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  return {
    method: transaction.gateway,
    amount: transaction.amount ? Math.round(transaction.amount.amount) : undefined,
  }
}
