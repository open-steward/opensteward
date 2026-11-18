/**
 * Mercado Libre Payment → canonical Transaction.
 *
 * Mercado Libre's Payments API surfaces payment details on orders.
 * Payments are embedded in the order response under `payments[]`.
 *
 * ML payment statuses: approved, pending, authorized, in_process,
 *                      in_mediation, rejected, cancelled, refunded, charged_back
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawMeliPayment {
  id: number
  order_id?: number
  payer_id?: number
  status: string
  status_detail?: string
  transaction_amount?: number
  currency_id?: string
  date_created?: string
  date_approved?: string
  date_last_updated?: string
  payment_method_id?: string
  payment_type?: string
  installments?: number
  authorization_code?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KIND_MAP: Record<string, TransactionKind> = {
  approved: 'SALE',
  authorized: 'AUTHORIZATION',
  refunded: 'REFUND',
  charged_back: 'REFUND',
  cancelled: 'VOID',
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  approved: 'SUCCESS',
  pending: 'PENDING',
  authorized: 'PENDING',
  in_process: 'PENDING',
  in_mediation: 'PENDING',
  rejected: 'FAILURE',
  cancelled: 'FAILURE',
  refunded: 'SUCCESS',
  charged_back: 'SUCCESS',
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformTransaction(raw: RawMeliPayment): Transaction {
  const kind = KIND_MAP[raw.status] ?? 'SALE'
  const status = STATUS_MAP[raw.status] ?? 'PENDING'
  const amount =
    raw.transaction_amount != null && raw.currency_id
      ? { amount: raw.transaction_amount, currency: raw.currency_id }
      : undefined

  return {
    id: String(raw.id),
    orderId: raw.order_id ? String(raw.order_id) : undefined,
    kind,
    status,
    amount,
    gateway: raw.payment_method_id ?? 'mercadopago',
    authorizationCode: raw.authorization_code ?? undefined,
    processedAt: raw.date_approved ?? raw.date_created,
    createdAt: toIsoDatetime(raw.date_created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
