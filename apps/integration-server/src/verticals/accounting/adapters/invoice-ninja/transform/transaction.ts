/**
 * Invoice Ninja v5 payment → canonical Transaction.
 *
 * Endpoint: GET /api/v1/payments
 * Single:   GET /api/v1/payments/{id}
 *
 * Invoice Ninja payments (incoming or outgoing) are the closest match to the
 * canonical Transaction schema.
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { currencyIdToIso } from '../constants'

export interface InvoiceNinjaPaymentInvoice {
  invoice_id?: string | null
  amount?: number | null
  [key: string]: unknown
}

export interface InvoiceNinjaPayment {
  id: string
  client_id?: string | null
  type_id?: string | null
  date?: string | null
  transaction_reference?: string | null
  private_notes?: string | null
  amount?: number | null
  refunded?: number | null
  currency_id?: string | null
  paymentables?: InvoiceNinjaPaymentInvoice[] | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

function parseDateStr(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function parseEpoch(n?: number | null): Date | undefined {
  if (!n) return undefined
  return new Date(n * 1000)
}

function buildLineitems(raw: InvoiceNinjaPayment): TransactionLineitem[] {
  if (!raw.paymentables?.length) {
    return [{ totalAmount: raw.amount ?? undefined }]
  }
  return raw.paymentables.map((p) => ({
    accountId: p.invoice_id || undefined,
    totalAmount: p.amount ?? undefined,
  }))
}

export function transformTransaction(raw: InvoiceNinjaPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.client_id) {
    contacts.push({ id: raw.client_id })
  }

  return {
    id: raw.id,
    type: raw.type_id ? String(raw.type_id) : undefined,
    reference: raw.transaction_reference || undefined,
    memo: raw.private_notes || undefined,
    currency: currencyIdToIso(raw.currency_id),
    totalAmount: raw.amount ?? undefined,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: buildLineitems(raw),
    createdAt: parseDateStr(raw.date) ?? parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
