/**
 * Mercado Pago subscription invoices are exposed as "authorized payments"
 * via GET /authorized_payments/search (filter by preapproval_id or payer).
 * Each record represents one billing cycle charge against a preapproval
 * (subscription).
 *
 * API ref: https://www.mercadopago.com/developers/en/reference/subscriptions/_authorized_payments_search/get
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMPAuthorizedPayment {
  id?: number | string
  type?: string
  date_created?: string
  last_modified?: string
  preapproval_id?: string
  reason?: string
  external_reference?: string
  currency_id?: string
  transaction_amount?: number
  debit_date?: string
  retry_attempt?: number
  status?: string
  /** Nested payment record created when the invoice is collected. */
  payment?: {
    id?: number | string
    status?: string
    status_detail?: string
  }
  [k: string]: unknown
}

function mapStatus(raw: RawMPAuthorizedPayment): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'processed':
      return 'paid'
    case 'scheduled':
    case 'waiting for gateway':
    case 'recycling':
      return 'open'
    case 'cancelled':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawMPAuthorizedPayment): Invoice {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    subscriptionId: raw.preapproval_id,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency_id),
    total: decimalToMinor(raw.transaction_amount),
    amountDue: mapStatus(raw) === 'paid' ? 0 : decimalToMinor(raw.transaction_amount),
    amountPaid: mapStatus(raw) === 'paid' ? decimalToMinor(raw.transaction_amount) : 0,
    amountRemaining: mapStatus(raw) === 'paid' ? 0 : decimalToMinor(raw.transaction_amount),
    dueDate: raw.debit_date,
    paidAt: mapStatus(raw) === 'paid' ? (raw.last_modified ?? raw.date_created) : undefined,
    gateway: 'mercado-pago',
    metadata: strMap({
      type: raw.type,
      external_reference: raw.external_reference,
      retry_attempt: raw.retry_attempt != null ? String(raw.retry_attempt) : undefined,
      payment_id: raw.payment?.id != null ? String(raw.payment.id) : undefined,
    }),
    createdAt: raw.date_created,
    updatedAt: raw.last_modified,
    raw,
  }
}
