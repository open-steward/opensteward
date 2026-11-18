/**
 * Paystack "Payment Requests" → canonical Invoice.
 *
 * Paystack's /paymentrequest endpoint represents invoices sent to customers
 * for payment. Each payment request has a status, amount, and customer.
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap } from './shared'

export interface RawPaystackInvoice {
  id?: string
  domain?: string
  request_code?: string
  description?: string
  line_items?: Array<{ name?: string; amount?: number }>
  tax?: Array<{ name?: string; amount?: number }>
  amount?: number
  discount?: number | null
  currency?: string
  due_date?: string | null
  status?: string
  paid?: boolean
  paid_at?: string | null
  customer?: {
    id?: number
    customer_code?: string
    email?: string
  } | null
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPaystackInvoice): InvoiceStatus {
  if (raw.status === 'success' || raw.paid === true) return 'paid'
  switch ((raw.status ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'pending':
    case 'sent':
      return 'open'
    case 'paid':
    case 'success':
      return 'paid'
    case 'abandoned':
    case 'cancelled':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawPaystackInvoice): Invoice {
  const currency = pickCurrency(raw.currency)
  const taxTotal = (raw.tax ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0)

  return {
    id: String(raw.id ?? raw.request_code ?? ''),
    externalId: String(raw.request_code ?? raw.id ?? ''),
    customerId: raw.customer?.customer_code
      ? String(raw.customer.customer_code)
      : raw.customer?.id
        ? String(raw.customer.id)
        : undefined,
    status: mapStatus(raw),
    currency,
    total: raw.amount ?? 0,
    tax: taxTotal || undefined,
    amountDue: raw.paid ? 0 : (raw.amount ?? 0),
    amountPaid: raw.paid ? (raw.amount ?? 0) : 0,
    amountRemaining: raw.paid ? 0 : (raw.amount ?? 0),
    dueDate: raw.due_date ?? undefined,
    paidAt: raw.paid_at ?? undefined,
    gateway: 'paystack',
    metadata: strMap({ description: raw.description, domain: raw.domain }),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  }
}
