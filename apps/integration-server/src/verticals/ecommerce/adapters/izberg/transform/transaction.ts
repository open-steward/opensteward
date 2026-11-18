/**
 * IZBERG Transaction → canonical Transaction.
 *
 * IZBERG exposes a `transaction` resource representing the financial accounting
 * entries generated when an order is placed or refunded. Each transaction is
 * linked to an order and carries the settlement amount and a type code.
 *
 * Endpoint: GET /v1/transaction/, GET /v1/transaction/{id}/
 *
 * Known fields (from Python SDK tests):
 *   id               — numeric transaction id
 *   resource_uri     — e.g. "/v1/transaction/42/"
 *   order            — order id (FK)
 *   amount           — decimal string, major-unit amount (can be negative for refunds)
 *   currency         — ISO-4217 currency code
 *   transaction_type — integer: 1 = sale, 2 = refund
 *   status           — optional status string
 *   date_created     — ISO datetime string
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

// ── Raw IZBERG shape ─────────────────────────────────────────────────────────

export interface RawIzbergTransaction {
  id: number | string
  resource_uri?: string
  order?: number | string | null
  amount?: string | number | null
  currency?: string | null
  /**
   * IZBERG transaction_type codes:
   *   1 = sale (payment captured for an order)
   *   2 = refund (reversal of a sale)
   */
  transaction_type?: number | null
  status?: string | null
  date_created?: string | null
  date_modified?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapKind(transactionType: number | null | undefined): TransactionKind | undefined {
  if (transactionType == null) return undefined
  if (transactionType === 1) return 'SALE'
  if (transactionType === 2) return 'REFUND'
  return undefined
}

function mapStatus(status: string | null | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'complete':
    case 'completed':
    case 'success':
      return 'SUCCESS'
    case 'pending':
      return 'PENDING'
    case 'failed':
    case 'failure':
      return 'FAILURE'
    case 'error':
      return 'ERROR'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawIzbergTransaction): Transaction {
  const currency = raw.currency ?? 'EUR'
  const rawAmount = toNum(raw.amount)
  // IZBERG stores amounts as decimals; canonical Money uses minor units (cents).
  // Refund transactions may carry negative amounts — take the absolute value and
  // let `kind` ('REFUND') convey the direction.
  const amountMinor = majorToMinor(Math.abs(rawAmount), currency)

  return {
    id: String(raw.id),
    orderId: raw.order != null ? String(raw.order) : undefined,
    kind: mapKind(raw.transaction_type),
    status: mapStatus(raw.status),
    amount:
      raw.amount != null
        ? { amount: amountMinor, currency }
        : undefined,
    processedAt: toIsoDatetime(raw.date_created),
    createdAt: toIsoDatetime(raw.date_created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
