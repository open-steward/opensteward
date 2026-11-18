import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawRazorpayInvoice {
  id?: string
  receipt?: string
  customer_id?: string
  subscription_id?: string
  status?: string
  currency?: string
  amount?: number
  amount_paid?: number
  amount_due?: number
  date?: number
  due_date?: number
  paid_at?: number
  short_url?: string
  line_items?: Array<{ id?: string }>
  notes?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawRazorpayInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'issued':
    case 'partially_paid':
      return 'open'
    case 'paid':
      return 'paid'
    case 'cancelled':
    case 'expired':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawRazorpayInvoice): Invoice {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.receipt,
    customerId: raw.customer_id,
    subscriptionId: raw.subscription_id,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    total: raw.amount ?? 0,
    amountDue: raw.amount_due,
    amountPaid: raw.amount_paid,
    dueDate: toIso(raw.due_date),
    paidAt: toIso(raw.paid_at),
    hostedInvoiceUrl: raw.short_url,
    lineItemIds: raw.line_items?.map((l) => String(l.id ?? '')).filter(Boolean),
    gateway: 'razorpay',
    metadata: strMap(raw.notes),
    createdAt: toIso(raw.date),
    raw,
  }
}
