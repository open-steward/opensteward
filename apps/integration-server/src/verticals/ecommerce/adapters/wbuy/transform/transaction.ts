/**
 * WooCommerce Order → canonical Transaction.
 *
 * WooCommerce doesn't have a dedicated payment-transaction API. The
 * order itself records payment information (payment_method, total, status).
 * We synthesise one Transaction per order representing the primary payment
 * capture, mirroring how other WC-based adapters handle payment tracking.
 *
 * Transaction id: `txn:{orderId}`.
 *
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/#orders
 */

import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawWooCommerceTransactionOrder {
  id: number | string
  status?: string
  currency?: string
  total?: string | number | null
  payment_method?: string | null
  payment_method_title?: string | null
  date_paid?: string | null
  date_paid_gmt?: string | null
  date_created?: string | null
  date_created_gmt?: string | null
  [key: string]: unknown
}

function mapTransactionKind(status: string | undefined): TransactionKind | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'completed':
    case 'processing':
      return 'SALE'
    case 'on-hold':
      return 'AUTHORIZATION'
    case 'refunded':
      return 'REFUND'
    case 'cancelled':
    case 'pending':
    case 'failed':
      return 'VOID'
    default:
      return undefined
  }
}

function mapTransactionStatus(status: string | undefined): TransactionStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'completed':
    case 'processing':
      return 'SUCCESS'
    case 'pending':
    case 'on-hold':
      return 'PENDING'
    case 'cancelled':
    case 'failed':
    case 'refunded':
      return 'FAILURE'
    default:
      return undefined
  }
}

/**
 * Build a canonical Transaction from a WooCommerce order.
 * @param raw  The raw WooCommerce order object.
 */
export function transformTransaction(raw: RawWooCommerceTransactionOrder): Transaction {
  const orderId = String(raw.id)
  const currency = raw.currency ?? 'USD'
  const totalMajor =
    raw.total != null
      ? typeof raw.total === 'string'
        ? parseFloat(raw.total)
        : Number(raw.total)
      : undefined
  const amountMinor = totalMajor != null && !isNaN(totalMajor)
    ? majorToMinor(totalMajor, currency)
    : undefined

  return {
    id: `txn:${orderId}`,
    orderId,
    kind: mapTransactionKind(raw.status),
    status: mapTransactionStatus(raw.status),
    amount:
      amountMinor != null
        ? { amount: amountMinor, currency }
        : undefined,
    gateway: raw.payment_method ?? undefined,
    processedAt: toIsoDatetime(raw.date_paid_gmt ?? raw.date_paid) ?? undefined,
    createdAt: toIsoDatetime(raw.date_created_gmt ?? raw.date_created) ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
