/**
 * BigCommerce Transaction → canonical Transaction.
 *
 * BigCommerce v3 endpoint: `/v3/orders/{id}/transactions`. Transactions
 * are read-only in BigCommerce.
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'

export interface RawBigCommerceTransaction {
  id: number | string
  order_id?: number | string
  event?: string // 'purchase' | 'authorization' | 'capture' | 'refund' | 'void'
  status?: string // 'ok' | 'error' | 'pending'
  amount?: number
  currency?: string
  gateway?: string | null
  gateway_transaction_id?: string | null
  date_created?: string
  method?: string
  offline?: { display_name?: string }
  [key: string]: unknown
}

const KIND_MAP: Record<string, TransactionKind> = {
  authorization: 'AUTHORIZATION',
  capture: 'CAPTURE',
  purchase: 'SALE',
  sale: 'SALE',
  refund: 'REFUND',
  void: 'VOID',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  ok: 'SUCCESS',
  pending: 'PENDING',
  error: 'ERROR',
}

export function transformTransaction(raw: RawBigCommerceTransaction): Transaction {
  const currency = raw.currency ?? 'USD'
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : undefined,
    kind: raw.event ? KIND_MAP[raw.event.toLowerCase()] ?? undefined : undefined,
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    amount:
      raw.amount != null
        ? { amount: majorToMinor(raw.amount, currency), currency }
        : undefined,
    gateway: raw.gateway ?? undefined,
    authorizationCode: raw.gateway_transaction_id ?? undefined,
    processedAt: raw.date_created,
    createdAt: raw.date_created,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
