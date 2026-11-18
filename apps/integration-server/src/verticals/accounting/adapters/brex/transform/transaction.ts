/**
 * Transform Brex cash-account transaction records to the canonical Transaction type.
 *
 * Endpoint: GET /v2/transactions/cash/{id}
 *   - `id` is the cash account ID (not a transaction ID)
 *   - Query params: cursor, limit, posted_at_start
 *
 * Brex cash transaction shape:
 * {
 *   id: string
 *   description?: string
 *   amount: { amount: number; currency: string }   // negative = debit
 *   initiated_at_date?: string                      // ISO date string
 *   posted_at_date?: string                         // ISO date string (settled)
 *   type?: string                                   // e.g. "PAYMENT", "REFUND", "TRANSFER"
 *   merchant?: { raw_descriptor?: string; mcc?: string }
 *   expense?: { id?: string }
 * }
 *
 * Brex card transaction shape (GET /v2/transactions/card/primary):
 * {
 *   id: string
 *   description?: string
 *   amount: { amount: number; currency: string }
 *   initiated_at_date?: string
 *   posted_at_date?: string
 *   type?: string
 *   merchant?: { raw_descriptor?: string; mcc?: string }
 *   expense?: { id?: string }
 *   card_id?: string
 * }
 *
 * Amounts from Brex are already in minor units (cents).
 */

import type { Transaction } from '../../../schema/transaction'

export interface BrexMerchant {
  raw_descriptor?: string
  mcc?: string
}

export interface BrexCashTransaction {
  id: string
  description?: string
  amount?: { amount: number; currency: string }
  initiated_at_date?: string
  posted_at_date?: string
  type?: string
  merchant?: BrexMerchant
  expense?: { id?: string }
  [key: string]: unknown
}

export interface BrexCardTransaction {
  id: string
  description?: string
  amount?: { amount: number; currency: string }
  initiated_at_date?: string
  posted_at_date?: string
  type?: string
  merchant?: BrexMerchant
  expense?: { id?: string }
  card_id?: string
  [key: string]: unknown
}

export function transformCashTransaction(raw: BrexCashTransaction): Transaction {
  const postedDate = raw.posted_at_date || raw.initiated_at_date
  return {
    id: raw.id,
    type: raw.type || undefined,
    memo: raw.description || raw.merchant?.raw_descriptor || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: raw.amount?.amount ?? undefined,
    createdAt: raw.initiated_at_date ? new Date(raw.initiated_at_date) : undefined,
    updatedAt: postedDate ? new Date(postedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformCardTransaction(raw: BrexCardTransaction): Transaction {
  const postedDate = raw.posted_at_date || raw.initiated_at_date
  return {
    id: raw.id,
    type: raw.type || undefined,
    memo: raw.description || raw.merchant?.raw_descriptor || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: raw.amount?.amount ?? undefined,
    paymentMethod: 'CARD',
    createdAt: raw.initiated_at_date ? new Date(raw.initiated_at_date) : undefined,
    updatedAt: postedDate ? new Date(postedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
