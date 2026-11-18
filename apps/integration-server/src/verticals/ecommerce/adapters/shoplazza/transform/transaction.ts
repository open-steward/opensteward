/**
 * Shoplazza Transaction → canonical Transaction.
 *
 * Shoplazza exposes transactions nested under orders:
 *   GET /openapi/{version}/orders/{order_id}/transactions
 *
 * Field names (from Go SDK Transaction struct):
 *   id, order_id, amount, kind, gateway, status, message, created_at,
 *   authorization, currency, parent_id, error_code.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawShoplazzaTransaction {
  id: number | string
  order_id?: number | string
  kind?: string | null
  status?: string | null
  amount?: string | number
  currency?: string
  gateway?: string | null
  authorization?: string | null
  parent_id?: number | string | null
  error_code?: string | null
  message?: string | null
  processed_at?: string | null
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

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

export function transformTransaction(raw: RawShoplazzaTransaction): Transaction {
  const currency = raw.currency ?? 'USD'
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : undefined,
    kind: raw.kind ? KIND_MAP[raw.kind.toLowerCase()] ?? undefined : undefined,
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    amount:
      raw.amount != null
        ? { amount: majorToMinor(toNum(raw.amount), currency), currency }
        : undefined,
    gateway: raw.gateway ?? undefined,
    authorizationCode: raw.authorization ?? undefined,
    parentTransactionId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    errorCode: raw.error_code ?? undefined,
    errorMessage: raw.message ?? undefined,
    processedAt: raw.processed_at ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  return {
    kind: transaction.kind?.toLowerCase(),
    amount: minorToMajor(transaction.amount?.amount, transaction.amount?.currency)?.toFixed(2),
    currency: transaction.amount?.currency,
    gateway: transaction.gateway,
    parent_id: transaction.parentTransactionId,
  }
}
