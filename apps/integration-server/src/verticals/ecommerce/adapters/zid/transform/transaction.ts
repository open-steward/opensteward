/**
 * Zid Transaction → canonical Transaction.
 *
 * Zid surfaces payment transactions on orders via the `payment` object's
 * `invoice` array and `transaction_reference` / `transaction_amount` fields.
 * There is no dedicated /transactions endpoint — we synthesise one Transaction
 * per order from the top-level payment fields.
 *
 * The id is synthesised as `txn:{orderId}`.
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import type { RawZidOrder } from './order'

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/**
 * Map Zid payment_status → canonical TransactionStatus.
 *
 * Zid payment statuses: pending, paid, refunded, voided
 */
const STATUS_MAP: Record<string, TransactionStatus> = {
  pending: 'PENDING',
  paid: 'SUCCESS',
  refunded: 'SUCCESS', // was successful; now reversed
  voided: 'PENDING',  // was never captured
}

export function transformTransaction(raw: RawZidOrder): Transaction {
  const currency = raw.currency_code ?? 'SAR'
  const amount = toNum((raw.transaction_amount as number | string | null | undefined) ?? raw.order_total)
  const paymentStatus = raw.payment_status?.toLowerCase()

  return {
    id: `txn:${String(raw.id ?? '')}`,
    orderId: String(raw.id ?? ''),
    kind: paymentStatus === 'refunded' ? 'REFUND' : 'SALE',
    status: paymentStatus ? STATUS_MAP[paymentStatus] ?? undefined : undefined,
    amount:
      amount > 0
        ? { amount: majorToMinor(amount, currency), currency }
        : undefined,
    gateway: (raw.payment as Record<string, unknown> | undefined)?.method != null
      ? String(((raw.payment as Record<string, unknown>)['method'] as Record<string, unknown>)?.['name'] ?? '')
      : undefined,
    authorizationCode: raw.transaction_reference ? String(raw.transaction_reference) : undefined,
    processedAt: raw.issue_date ?? raw.created_at,
    createdAt: raw.created_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Transaction → Zid payment body (minimal). */
export function untransformTransaction(transaction: Partial<Transaction>): Record<string, unknown> {
  return {
    transaction_amount: transaction.amount?.amount,
    currency_code: transaction.amount?.currency,
  }
}
