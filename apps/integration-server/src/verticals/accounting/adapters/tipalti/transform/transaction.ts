/**
 * Tipalti payment → canonical Transaction transform.
 *
 * Tipalti payments represent disbursements made to payees.
 * REST endpoint: GET /v1/payments
 *
 * Wire fields (snake_case):
 *   id, status, payeeId, currency, amount, paymentDate,
 *   paymentMethod, referenceCode, invoiceIds[], createdAt, updatedAt
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'

// ── Wire types ────────────────────────────────────────────────────────────────

export interface TipaltiPayment {
  id: string
  status?: string
  payeeId?: string
  currency?: string
  amount?: number
  paymentDate?: string
  paymentMethod?: string
  referenceCode?: string
  invoiceIds?: string[]
  bankAccountId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: TipaltiPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.payeeId) {
    contacts.push({ id: raw.payeeId })
  }

  return {
    id: raw.id,
    accountId: raw.bankAccountId || undefined,
    currency: raw.currency || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.paymentDate
      ? new Date(raw.paymentDate)
      : raw.createdAt
        ? new Date(raw.createdAt)
        : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
