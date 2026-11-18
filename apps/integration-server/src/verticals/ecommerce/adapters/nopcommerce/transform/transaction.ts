/**
 * nopCommerce order payment → canonical Transaction.
 *
 * nopCommerce does not expose a dedicated payment transaction endpoint.
 * Payment data is derived from the order's `payment_status` and amount
 * fields. The adapter synthesizes Transaction objects from order data.
 */
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawNopTransaction {
  id?: number | string
  order_id?: number | string
  payment_status?: string | null
  order_total?: number
  currency?: string
  paid_date_utc?: string | null
  payment_method_system_name?: string | null
  authorization_transaction_id?: string | null
  authorization_transaction_code?: string | null
  capture_transaction_id?: string | null
  [key: string]: unknown
}

function mapStatus(paymentStatus: string | null | undefined): TransactionStatus | undefined {
  switch ((paymentStatus ?? '').toLowerCase()) {
    case 'paid':
    case 'authorized':
      return 'SUCCESS'
    case 'pending':
      return 'PENDING'
    case 'refunded':
    case 'partiallyrefunded':
    case 'voided':
      return 'FAILURE'
    default:
      return undefined
  }
}

function mapKind(paymentStatus: string | null | undefined): TransactionKind | undefined {
  const s = (paymentStatus ?? '').toLowerCase()
  if (s === 'authorized') return 'AUTHORIZATION'
  if (s === 'paid') return 'SALE'
  if (s === 'refunded' || s === 'partiallyrefunded') return 'REFUND'
  if (s === 'voided') return 'VOID'
  return 'SALE'
}

export function transformTransaction(raw: RawNopTransaction, orderId: string): Transaction {
  const currency = raw.currency ?? 'USD'
  return {
    id: String(raw.authorization_transaction_id ?? raw.capture_transaction_id ?? raw.id ?? ''),
    orderId,
    kind: mapKind(raw.payment_status),
    status: mapStatus(raw.payment_status),
    amount:
      raw.order_total != null
        ? { amount: majorToMinor(raw.order_total, currency), currency }
        : undefined,
    gateway: raw.payment_method_system_name ?? undefined,
    authorizationCode: raw.authorization_transaction_code ?? undefined,
    processedAt: raw.paid_date_utc ?? undefined,
    createdAt: raw.paid_date_utc ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
