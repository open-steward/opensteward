/**
 * Spree Payment → canonical Transaction.
 *
 * Spree payments live under `/api/v2/platform/payments` and track
 * monetary movements on an order. Each payment has:
 *  - `state`: checkout | pending | completed | failed | void | invalid
 *  - `amount` / `currency`
 *  - `payment_method` (gateway)
 *  - `response_code` (authorization)
 *  - `source_type` (CreditCard, StoreCredit, etc.)
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSpreePayment {
  id: number | string
  order_id?: number | string
  state?: string
  amount?: string | number
  currency?: string
  payment_method_name?: string
  payment_method_id?: number | string
  source_type?: string
  response_code?: string | null
  avs_response?: string | null
  number?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapKind(state: string | undefined): TransactionKind | undefined {
  switch (state) {
    case 'checkout':
    case 'pending':
      return 'AUTHORIZATION'
    case 'completed':
      return 'CAPTURE'
    case 'void':
      return 'VOID'
    default:
      return 'SALE'
  }
}

function mapStatus(state: string | undefined): TransactionStatus | undefined {
  switch (state) {
    case 'completed':
      return 'SUCCESS'
    case 'pending':
    case 'checkout':
    case 'processing':
      return 'PENDING'
    case 'failed':
    case 'invalid':
      return 'FAILURE'
    case 'void':
      return 'SUCCESS'
    default:
      return undefined
  }
}

export function transformTransaction(raw: RawSpreePayment): Transaction {
  const currency = raw.currency ?? 'USD'
  return {
    id: String(raw.id),
    orderId: raw.order_id != null ? String(raw.order_id) : undefined,
    kind: mapKind(raw.state),
    status: mapStatus(raw.state),
    amount:
      raw.amount != null
        ? { amount: majorToMinor(toNum(raw.amount), currency), currency }
        : undefined,
    gateway: raw.payment_method_name ?? undefined,
    authorizationCode: raw.response_code ?? undefined,
    processedAt: toIsoDatetime(raw.created_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformTransaction(
  transaction: Partial<Transaction>,
): Record<string, unknown> {
  return {
    payment: {
      amount: transaction.amount?.amount,
      payment_method_id: transaction.gateway,
    },
  }
}
