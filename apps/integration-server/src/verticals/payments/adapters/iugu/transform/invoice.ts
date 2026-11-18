/**
 * Iugu Invoice -> canonical Invoice.
 *
 * Iugu invoices are the primary billing document: each invoice (boleto/pix/card)
 * has a unique id, status, and total_cents. Subscription invoices include
 * subscription_id. Reference: https://dev.iugu.com
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { strMap, safeInt, pickCurrency } from './shared'

export interface RawIuguInvoice {
  [k: string]: unknown
}

function mapStatus(raw: RawIuguInvoice): InvoiceStatus {
  const s = typeof raw['status'] === 'string' ? raw['status'].toLowerCase() : ''
  if (s === 'paid') return 'paid'
  if (s === 'pending' || s === 'partially_paid') return 'open'
  if (s === 'cancelled' || s === 'canceled' || s === 'refunded' || s === 'chargeback') return 'void'
  if (s === 'draft') return 'draft'
  if (s === 'expired' || s === 'unpaid') return 'uncollectible'
  return 'open'
}

export function transformInvoice(raw: RawIuguInvoice): Invoice {
  const currency = pickCurrency(raw['currency'] as string | undefined, 'BRL')
  const totalCents = safeInt(raw['total_cents'])
  const paidCents = safeInt(raw['paid_cents'])
  const number = raw['secure_id'] != null ? String(raw['secure_id']) : undefined

  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    number,
    customerId: raw['customer_id'] != null ? String(raw['customer_id']) : undefined,
    subscriptionId: raw['subscription_id'] != null ? String(raw['subscription_id']) : undefined,
    status: mapStatus(raw),
    currency,
    total: totalCents,
    amountPaid: paidCents || undefined,
    amountDue: safeInt(raw['total_cents']) - safeInt(raw['paid_cents']) || undefined,
    dueDate: raw['due_date'] != null ? String(raw['due_date']) : undefined,
    paidAt: raw['financial_return_date'] != null ? String(raw['financial_return_date']) : undefined,
    hostedInvoiceUrl: raw['secure_url'] != null ? String(raw['secure_url']) : undefined,
    gateway: 'iugu',
    metadata: strMap(raw['metadata'] ?? raw['custom_variables'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
