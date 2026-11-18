/**
 * WooCommerce Order Transaction → canonical Transaction.
 *
 * WooCommerce's REST API exposes a light `/orders/{id}/transactions` endpoint
 * from WC 3.x, but in practice the payment metadata lives on the order itself:
 *   - `payment_method`        (gateway slug)
 *   - `payment_method_title`  (human label)
 *   - `transaction_id`        (gateway transaction reference)
 *   - `date_paid` / `date_paid_gmt`
 *   - `total`                 (amount, decimal string in order currency)
 *
 * We synthesise one Transaction per order from these fields, using the
 * WC order `id` as the transaction id so it is always stable.
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawWooCommerceOrderForTransaction {
  id: number | string
  status?: string | null
  currency?: string | null
  payment_method?: string | null
  payment_method_title?: string | null
  transaction_id?: string | null
  total?: string | number | null
  date_paid?: string | null
  date_paid_gmt?: string | null
  date_created?: string | null
  date_created_gmt?: string | null
  [key: string]: unknown
}

function mapKind(_status: string | null | undefined): TransactionKind {
  return 'SALE'
}

function mapStatus(status: string | null | undefined): TransactionStatus | undefined {
  switch (status) {
    case 'processing':
    case 'completed':
    case 'on-hold':
      return 'SUCCESS'
    case 'failed':
    case 'cancelled':
      return 'FAILURE'
    case 'pending':
      return 'PENDING'
    default:
      return undefined
  }
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

export function transformTransaction(raw: RawWooCommerceOrderForTransaction): Transaction {
  const currency = raw.currency ?? 'USD'
  const totalMajor = toNum(raw.total)
  const amount = totalMajor > 0
    ? { amount: majorToMinor(totalMajor, currency), currency }
    : undefined

  return {
    id: String(raw.id),
    orderId: String(raw.id),
    kind: mapKind(raw.status),
    status: mapStatus(raw.status),
    amount,
    gateway: raw.payment_method ?? undefined,
    authorizationCode: raw.transaction_id ?? undefined,
    processedAt: raw.date_paid_gmt ?? raw.date_paid ?? undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created ?? undefined,
    metadata: {
      payment_method_title: raw.payment_method_title ?? '',
      woocommerce_order_id: String(raw.id),
    },
  }
}
