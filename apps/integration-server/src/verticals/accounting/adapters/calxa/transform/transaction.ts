import type { Transaction } from '../../../schema/transaction'

/**
 * Calxa transaction (bank transaction / payment) as returned by
 * GET /transactions and GET /transactions/:id.
 *
 * Calxa surfaces bank and payment transactions synced from the connected
 * accounting system.
 */
export interface CalxaTransaction {
  id: string
  /** Bank account or GL account this transaction is posted to. */
  accountId?: string
  /** Transaction type, e.g. "RECEIVE" | "SPEND" | "TRANSFER". */
  type?: string
  /** External reference such as a cheque number or invoice number. */
  reference?: string
  /** Free-text memo / narration. */
  memo?: string
  /** ISO 4217 currency code. */
  currency?: string
  /** Sub-total before tax. */
  subTotal?: number
  /** Tax amount. */
  taxAmount?: number
  /** Total transaction amount (positive for receipts, negative for payments). */
  total?: number
  /** ISO 8601 transaction date. */
  date?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTransaction(raw: CalxaTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    type: raw.type || undefined,
    reference: raw.reference || undefined,
    memo: raw.memo || undefined,
    currency: raw.currency || undefined,
    subTotalAmount: raw.subTotal ?? undefined,
    taxAmount: raw.taxAmount ?? undefined,
    totalAmount: raw.total ?? undefined,
    createdAt: raw.date ? new Date(raw.date) : raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
