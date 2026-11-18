/**
 * Haravan Transaction → canonical Transaction.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/transactions/
 *
 * Haravan documents `amount`, `authorization`, `created_at`, `gateway`, `id`,
 * `kind`, `order_id`, `status`, `user_id`, `location_id`, `currency` — no
 * `parent_id`, `error_code`, `message` or `processed_at` (unlike Shopify), so
 * `parentTransactionId`/`errorCode`/`errorMessage`/`processedAt` are always
 * left undefined here rather than guessed.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'

export interface RawHaravanTransaction {
  id: number | string
  order_id?: number | string
  kind?: string | null
  status?: string | null
  amount?: string | number
  currency?: string
  gateway?: string | null
  authorization?: string | null
  created_at?: string
  [key: string]: unknown
}

const KIND_MAP: Record<string, TransactionKind> = {
  authorization: 'AUTHORIZATION',
  capture: 'CAPTURE',
  sale: 'SALE',
  refund: 'REFUND',
  void: 'VOID',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  pending: 'PENDING',
  success: 'SUCCESS',
  failure: 'FAILURE',
  error: 'ERROR',
}

export function transformTransaction(raw: RawHaravanTransaction): Transaction {
  const currency = raw.currency
  const amount = raw.amount != null ? (typeof raw.amount === 'string' ? parseFloat(raw.amount) : raw.amount) : undefined
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : undefined,
    kind: raw.kind ? KIND_MAP[raw.kind.toLowerCase()] ?? undefined : undefined,
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    amount: amount != null && currency != null ? { amount, currency } : undefined,
    gateway: raw.gateway ?? undefined,
    authorizationCode: raw.authorization ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Haravan's documented create-transaction endpoint lives at
 * `orders/{order_id}/transations.json` — that exact misspelling, not a typo
 * introduced here — see index.ts.
 */
export function untransformTransaction(transaction: Partial<Transaction>): Record<string, unknown> {
  return {
    kind: transaction.kind?.toLowerCase(),
    amount: transaction.amount?.amount,
    currency: transaction.amount?.currency,
    gateway: transaction.gateway,
  }
}
