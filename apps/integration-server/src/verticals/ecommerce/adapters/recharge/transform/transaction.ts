/**
 * Recharge Charge → canonical Transaction.
 *
 * Recharge 2021-11 has no dedicated `/transactions` resource. Instead, billing
 * events are modelled as Charges (`/charges`), which track the full payment
 * lifecycle: queued → pending → success / error / refunded.
 *
 * Mapping logic:
 *  - `id`                        → Transaction.id
 *  - `external_order_id.ecommerce` → Transaction.orderId (falls back to `id`)
 *  - charge `status`             → Transaction.kind + Transaction.status
 *  - `total_price`               → Transaction.amount (major → minor units)
 *  - `payment_processor`         → Transaction.gateway
 *  - `external_transaction_id.*` → Transaction.authorizationCode
 *  - `error` / `error_type`      → Transaction.errorMessage / errorCode
 *  - `processed_at`              → Transaction.processedAt
 *  - `created_at`                → Transaction.createdAt
 *
 * Docs: https://developer.rechargepayments.com/2021-11/charges/charge_object
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Recharge charge shape (transaction-relevant subset) ──────────────────

export interface RawRechargeCharge {
  id: number | string
  /** Linked ecommerce order id, e.g. from Shopify. */
  external_order_id?: { ecommerce?: string | null } | null
  /** Payment gateway that processed this charge, e.g. "stripe". */
  payment_processor?: string | null
  /**
   * External transaction id keyed by processor name,
   * e.g. `{ "stripe": "ch_1HzWEl..." }`.
   */
  external_transaction_id?: Record<string, string | null> | null
  /**
   * Charge status:
   *  "success" | "error" | "queued" | "skipped" | "refunded" |
   *  "partially_refunded" | "pending_manual_payment" | "pending"
   */
  status?: string | null
  /** Charge total as decimal major units string, e.g. "19.99". */
  total_price?: string | number | null
  currency?: string | null
  /** Human-readable error reason from the payment processor. */
  error?: string | null
  /** Structured error code, e.g. "CUSTOMER_NEEDS_TO_UPDATE_CARD". */
  error_type?: string | null
  processed_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapKind(status: string | null | undefined): TransactionKind | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'success':
    case 'pending':
    case 'queued':
    case 'pending_manual_payment':
      return 'SALE'
    case 'refunded':
    case 'partially_refunded':
      return 'REFUND'
    default:
      return undefined
  }
}

function mapStatus(status: string | null | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'success':
      return 'SUCCESS'
    case 'pending':
    case 'queued':
    case 'pending_manual_payment':
      return 'PENDING'
    case 'error':
      return 'ERROR'
    case 'refunded':
    case 'partially_refunded':
      return 'SUCCESS'
    case 'skipped':
      return 'FAILURE'
    default:
      return undefined
  }
}

/** Extract the first non-null value from the external_transaction_id map. */
function extractAuthCode(
  extTxn: Record<string, string | null> | null | undefined,
): string | undefined {
  if (!extTxn) return undefined
  for (const val of Object.values(extTxn)) {
    if (val) return val
  }
  return undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawRechargeCharge): Transaction {
  const currency = raw.currency ?? 'USD'
  const totalMajor = toNum(raw.total_price)
  const amount =
    totalMajor > 0
      ? { amount: majorToMinor(totalMajor, currency), currency }
      : undefined

  return {
    id: String(raw.id),
    orderId: raw.external_order_id?.ecommerce ?? String(raw.id),
    kind: mapKind(raw.status),
    status: mapStatus(raw.status),
    amount,
    gateway: raw.payment_processor ?? undefined,
    authorizationCode: extractAuthCode(raw.external_transaction_id),
    errorCode: raw.error_type ?? undefined,
    errorMessage: raw.error ?? undefined,
    processedAt: toIsoDatetime(raw.processed_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
