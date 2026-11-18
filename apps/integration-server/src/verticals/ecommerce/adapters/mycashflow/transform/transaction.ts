/**
 * MyCashflow Payment → canonical Transaction.
 *
 * MyCashflow exposes payment information on orders via payment status and
 * payment method fields. Individual payment transaction objects (if surfaced
 * by the API) are mapped here.
 *
 * Key fields:
 *  - `id`             — payment / transaction identifier
 *  - `order_id`       — parent order
 *  - `amount`         — transaction amount (decimal major units)
 *  - `currency`       — ISO-4217 currency code
 *  - `status`         — "paid", "pending", "failed", "refunded"
 *  - `payment_method` — gateway / payment method name
 *  - `created_at`     — ISO-8601 timestamp
 *
 * Docs: https://support.mycashflow.com/api/11-orders/
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawMyCashflowTransaction {
  id: number | string
  order_id?: number | string | null
  /** Transaction amount as a decimal major-unit number. */
  amount?: number | null
  currency?: string | null
  status?: string | null
  payment_method?: string | null
  /** Some API shapes use `gateway` for the payment provider slug. */
  gateway?: string | null
  kind?: string | null
  created_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  paid: 'SUCCESS',
  success: 'SUCCESS',
  pending: 'PENDING',
  failed: 'FAILURE',
  failure: 'FAILURE',
  refunded: 'SUCCESS',
  error: 'ERROR',
}

const KIND_MAP: Record<string, TransactionKind> = {
  sale: 'SALE',
  capture: 'CAPTURE',
  authorization: 'AUTHORIZATION',
  refund: 'REFUND',
  void: 'VOID',
}

export function transformTransaction(
  raw: RawMyCashflowTransaction,
  orderId?: string,
): Transaction {
  const currency = raw.currency ?? 'EUR'
  const amount =
    raw.amount != null
      ? { amount: majorToMinor(raw.amount, currency), currency }
      : undefined
  const statusKey = (raw.status ?? '').toLowerCase()
  const kindKey = (raw.kind ?? '').toLowerCase()
  const gateway = raw.gateway ?? raw.payment_method ?? undefined

  return {
    id: String(raw.id),
    orderId:
      raw.order_id != null ? String(raw.order_id) : orderId,
    kind: kindKey ? KIND_MAP[kindKey] ?? undefined : undefined,
    status: statusKey ? STATUS_MAP[statusKey] ?? undefined : undefined,
    amount,
    gateway,
    processedAt: raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
