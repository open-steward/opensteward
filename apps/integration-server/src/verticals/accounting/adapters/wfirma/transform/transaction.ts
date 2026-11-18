/**
 * wFirma payments → canonical Transaction.
 *
 * wFirma records individual payment entries (for invoices and expenses) under
 * the `payments` resource. Each payment links to a contractor (contact) and
 * optionally to an invoice or expense document.
 * Endpoint: GET /payments/get/{id}, POST /payments/find
 *
 * Docs: https://doc.wfirma.pl/ (payments module)
 * SDK reference: https://github.com/dbojdo/wFirma/tree/master/src/Payments
 *
 * Field mapping from wFirma PHP SDK (Payment.php):
 *   object_name      — "invoice" | "expense"
 *   date             — YYYY-MM-DD payment date
 *   value            — decimal amount in document currency
 *   value_pln        — decimal amount in PLN
 *   payment_method   — payment method label
 *   payment_type     — payment direction / type
 *   account          — bank account string
 *   currency_label   — ISO-4217 currency code
 *   invoice          — { id } linked invoice ID
 *   expense          — { id } linked expense ID
 *   contractor       — { id } linked contractor ID
 */

import type { Transaction } from '../../../schema/transaction'
import { toMinorUnits } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

export interface WfirmaPaymentRef {
  id?: number | string
  [key: string]: unknown
}

export interface WfirmaPayment {
  id?: number | string
  object_name?: string       // "invoice" | "expense"
  date?: string              // YYYY-MM-DD
  value?: number | string    // amount in document currency
  value_pln?: number | string // amount in PLN
  payment_method?: string
  payment_type?: string
  account?: string           // bank account identifier
  currency_label?: string    // ISO-4217 currency code
  currency_exchange?: number | string
  currency_date?: string
  notes?: string | number
  invoice?: WfirmaPaymentRef
  expense?: WfirmaPaymentRef
  contractor?: WfirmaPaymentRef
  series?: WfirmaPaymentRef
  payment_cashbox?: WfirmaPaymentRef
  created?: string
  modified?: string
  [key: string]: unknown
}

/** Convert a raw upstream timestamp to a Date via toIsoDatetime for safe handling. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

/** Derive a type label from the payment's object_name and payment_type. */
function mapType(raw: WfirmaPayment): string | undefined {
  const objectName = (raw.object_name ?? '').toLowerCase()
  if (objectName === 'invoice') return 'PAYMENT'
  if (objectName === 'expense') return 'BILL_PAYMENT'
  const pt = (raw.payment_type ?? '').toUpperCase()
  return pt || undefined
}

/** Extract a reference string from linked invoice or expense ID. */
function extractReference(raw: WfirmaPayment): string | undefined {
  const invId = raw.invoice?.id
  if (invId !== undefined) return `invoice:${invId}`
  const expId = raw.expense?.id
  if (expId !== undefined) return `expense:${expId}`
  return undefined
}

export function transformPayment(raw: WfirmaPayment): Transaction {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    type: mapType(raw),
    reference: extractReference(raw),
    memo: raw.notes !== undefined && raw.notes !== null && raw.notes !== 0
      ? String(raw.notes)
      : undefined,
    paymentMethod: raw.payment_method || undefined,
    currency: raw.currency_label || undefined,
    totalAmount: toMinorUnits(raw.value),
    contacts: raw.contractor?.id !== undefined
      ? [{ id: String(raw.contractor.id) }]
      : undefined,
    createdAt: toDate(raw.created),
    updatedAt: toDate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}
