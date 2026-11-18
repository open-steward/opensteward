/**
 * Tiendanube / Nuvemshop Transaction → canonical Transaction.
 *
 * Tiendanube's transaction model is event-based: a transaction object has a
 * `status` string and an `events` array of timestamped events. The amount
 * fields (`captured_amount`, `authorized_amount`, etc.) are objects with
 * `{ value, currency }`.
 *
 * We map:
 *  - Transaction status → canonical `TransactionStatus` (best-effort)
 *  - `captured_amount` or `authorized_amount` (whichever is non-zero) → `amount`
 *  - The first event's `type` → canonical `TransactionKind`
 *  - `info.authorization_code` → `authorizationCode`
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/transaction
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawTiendanubeAmountValue {
  value?: string | number | null
  currency?: string | null
}

export interface RawTiendanubeTransactionEvent {
  id?: string
  transaction_id?: string
  amount?: RawTiendanubeAmountValue
  type?: string | null
  status?: string | null
  authorization_code?: string | null
  failure_code?: string | null
  happened_at?: string | null
  created_at?: string
  [key: string]: unknown
}

export interface RawTiendanubeTransactionInfo {
  authorization_code?: string | null
  nsu?: string | null
  external_id?: string | null
  [key: string]: unknown
}

export interface RawTiendanubeTransaction {
  id: string | number
  payment_attempt_id?: string | null
  payment_provider_id?: string | null
  status?: string | null
  events?: RawTiendanubeTransactionEvent[]
  captured_amount?: RawTiendanubeAmountValue | null
  refunded_amount?: RawTiendanubeAmountValue | null
  authorized_amount?: RawTiendanubeAmountValue | null
  voided_amount?: RawTiendanubeAmountValue | null
  failure_code?: string | null
  info?: RawTiendanubeTransactionInfo | null
  created_at?: string
  [key: string]: unknown
}

// ── Status / kind maps ────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, TransactionStatus> = {
  paid: 'SUCCESS',
  authorized: 'SUCCESS',
  captured: 'SUCCESS',
  pending: 'PENDING',
  in_process: 'PENDING',
  in_fraud_analysis: 'PENDING',
  needs_merchant_review: 'PENDING',
  failed: 'FAILURE',
  rejected: 'FAILURE',
  expired: 'FAILURE',
  voided: 'FAILURE',
  refunded: 'SUCCESS',
  partially_refunded: 'SUCCESS',
}

const KIND_MAP: Record<string, TransactionKind> = {
  sale: 'SALE',
  authorization: 'AUTHORIZATION',
  capture: 'CAPTURE',
  refund: 'REFUND',
  void: 'VOID',
  in_fraud_analysis: 'AUTHORIZATION',
  needs_merchant_review: 'AUTHORIZATION',
  expiration: 'VOID',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function resolveAmount(
  tx: RawTiendanubeTransaction,
): { amount: number; currency: string } | undefined {
  // Prefer captured; fallback authorized; fallback refunded
  const candidates = [tx.captured_amount, tx.authorized_amount, tx.refunded_amount]
  for (const c of candidates) {
    if (!c) continue
    const val = toNum(c.value)
    if (val > 0 && c.currency) {
      return {
        amount: majorToMinor(val, c.currency),
        currency: c.currency,
      }
    }
  }
  return undefined
}

function resolveKind(tx: RawTiendanubeTransaction): TransactionKind | undefined {
  // Use the first event's type as the transaction kind
  const firstEvent = tx.events?.[0]
  if (!firstEvent?.type) return undefined
  return KIND_MAP[firstEvent.type.toLowerCase()] ?? undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(
  raw: RawTiendanubeTransaction,
  orderId?: string,
): Transaction {
  return {
    id: String(raw.id),
    orderId,
    kind: resolveKind(raw),
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    amount: resolveAmount(raw),
    gateway: raw.payment_provider_id ?? undefined,
    authorizationCode: raw.info?.authorization_code ?? undefined,
    errorCode: raw.failure_code ?? undefined,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
