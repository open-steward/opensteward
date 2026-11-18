/**
 * Salla Transaction → canonical Transaction.
 *
 * Salla exposes payment transaction data through order payment method details
 * and webhook events. The transaction object structure includes:
 *  - id, order_id, type (sale|refund|capture|void), status, amount, gateway
 *  - created_at
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaTransactionAmount {
  amount: number
  currency: string
}

export interface RawSallaTransaction {
  id: number | string
  order_id?: number | string | null
  type?: string | null
  status?: string | null
  amount?: RawSallaTransactionAmount
  gateway?: string | null
  authorization?: string | null
  parent_id?: number | string | null
  error_code?: string | null
  error_message?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KIND_MAP: Record<string, TransactionKind> = {
  sale: 'SALE',
  capture: 'CAPTURE',
  authorization: 'AUTHORIZATION',
  refund: 'REFUND',
  void: 'VOID',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  success: 'SUCCESS',
  succeeded: 'SUCCESS',
  completed: 'SUCCESS',
  pending: 'PENDING',
  failed: 'FAILURE',
  failure: 'FAILURE',
  error: 'ERROR',
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawSallaTransaction): Transaction {
  const currency = raw.amount?.currency ?? 'SAR'

  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : undefined,
    kind: raw.type ? KIND_MAP[raw.type.toLowerCase()] ?? undefined : undefined,
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    amount: raw.amount
      ? {
          amount: majorToMinor(raw.amount.amount, currency),
          currency,
        }
      : undefined,
    gateway: raw.gateway ?? undefined,
    authorizationCode: raw.authorization ?? undefined,
    parentTransactionId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    errorCode: raw.error_code ?? undefined,
    errorMessage: raw.error_message ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
