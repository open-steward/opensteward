/**
 * Ecwid Transaction transform.
 *
 * Ecwid does not expose a dedicated payments/transactions endpoint.
 * Payment information is surfaced via order data. Each order represents
 * a single transaction.
 *
 * Endpoint:
 *   GET /api/v3/{storeId}/orders/{orderId}  (payment info embedded in order)
 *
 * Key fields:
 *   - `id`/`orderNumber`   → id
 *   - `paymentStatus`      → status
 *   - `paymentMethod`      → gateway
 *   - `total`              → amount
 *   - `createDate`         → processedAt / createdAt
 */

import type { Transaction, TransactionStatus, TransactionKind } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawEcwidTransaction {
  id?: number | string
  orderNumber?: number | string
  paymentStatus?: string
  paymentMethod?: string
  paymentModule?: string
  total?: number
  currency?: string
  paymentTransactionId?: string
  createDate?: string
  updateDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TransactionStatus | undefined {
  switch ((s ?? '').toUpperCase()) {
    case 'PAID':
    case 'ACCEPTED':     return 'SUCCESS'
    case 'DECLINED':
    case 'CANCELLED':    return 'FAILURE'
    case 'AWAITING_PAYMENT':
    case 'QUEUED':       return 'PENDING'
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED': return 'SUCCESS'
    default:             return undefined
  }
}

function mapKind(paymentStatus: string | undefined): TransactionKind | undefined {
  const s = (paymentStatus ?? '').toUpperCase()
  if (s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED') return 'REFUND'
  return 'SALE'
}

export function transformTransaction(raw: RawEcwidTransaction): Transaction {
  const id = String(raw.id ?? raw.orderNumber ?? '')
  const currency = raw.currency ?? 'USD'

  return {
    id,
    orderId: String(raw.orderNumber ?? raw.id ?? ''),
    kind: mapKind(raw.paymentStatus),
    status: mapStatus(raw.paymentStatus),
    amount: raw.total != null
      ? { amount: majorToMinor(raw.total, currency), currency }
      : undefined,
    gateway: raw.paymentMethod ?? raw.paymentModule ?? undefined,
    authorizationCode: raw.paymentTransactionId ?? undefined,
    processedAt: raw.createDate ?? undefined,
    createdAt: raw.createDate ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
