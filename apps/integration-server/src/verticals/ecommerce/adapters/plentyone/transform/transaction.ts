/**
 * PlentyONE Payment → canonical Transaction.
 *
 * PlentyONE payments are stored under the payments resource. Each payment is
 * linked to an order and has an amount, currency, payment method, and status.
 *
 * Endpoints used:
 *   GET /rest/payments?orderId={orderId}
 *   GET /rest/payments/{paymentId}
 *   POST /rest/payments
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOnePayment {
  id: number | string
  /** 1 = credit, 2 = debit */
  type?: number | null
  /** Payment status: 1=provisional, 2=awaiting approval, 3=captured, 5=partially captured */
  status?: number | null
  amount?: number | null
  currency?: string | null
  entryDate?: string | null
  receivedDate?: string | null
  unassignedAmount?: number | null
  isSystemCurrency?: boolean
  parentId?: number | string | null
  mopId?: number | null
  transactionType?: string | null
  hash?: string | null
  externalTransactionId?: string | null
  note?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map PlentyONE payment type to canonical TransactionKind.
 * type 1 = incoming payment (credit) → CAPTURE/SALE
 * type 2 = outgoing payment (debit) → REFUND
 */
function mapKind(type: number | null | undefined): TransactionKind | undefined {
  if (type == null) return undefined
  if (type === 1) return 'CAPTURE'
  if (type === 2) return 'REFUND'
  return undefined
}

/**
 * Map PlentyONE payment status to canonical TransactionStatus.
 * 1 = provisional → PENDING
 * 2 = awaiting approval → PENDING
 * 3 = captured → SUCCESS
 * 4 = cancelled → FAILURE
 * 5 = partially captured → SUCCESS
 */
function mapStatus(status: number | null | undefined): TransactionStatus | undefined {
  if (status == null) return undefined
  if (status === 1 || status === 2) return 'PENDING'
  if (status === 3 || status === 5) return 'SUCCESS'
  if (status === 4) return 'FAILURE'
  return undefined
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformPayment(raw: RawPlentyOnePayment, orderId?: string): Transaction {
  const currency = raw.currency ?? 'EUR'
  return {
    id: String(raw.id),
    orderId: orderId ?? undefined,
    kind: mapKind(raw.type),
    status: mapStatus(raw.status),
    amount:
      raw.amount != null
        ? { amount: majorToMinor(Math.abs(raw.amount), currency), currency }
        : undefined,
    authorizationCode: raw.externalTransactionId ?? raw.hash ?? undefined,
    parentTransactionId: raw.parentId != null ? String(raw.parentId) : undefined,
    processedAt: toIsoDatetime(raw.receivedDate ?? raw.entryDate),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Transaction → PlentyONE payment body for create. */
export function untransformPayment(transaction: Partial<Transaction>): Record<string, unknown> {
  return {
    type: transaction.kind === 'REFUND' ? 2 : 1,
    amount: transaction.amount
      ? minorToMajor(transaction.amount.amount, transaction.amount.currency)
      : undefined,
    currency: transaction.amount?.currency,
    externalTransactionId: transaction.authorizationCode,
  }
}
