import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawRecurlyInvoice {
  id?: string
  number?: string
  state?: string
  account?: { id?: string }
  subscription_ids?: string[]
  currency?: string
  subtotal?: number
  tax?: number
  total?: number
  paid?: number
  balance?: number
  due_at?: string
  closed_at?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawRecurlyInvoice): InvoiceStatus {
  switch ((raw.state ?? '').toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'open':
    case 'pending':
    case 'past_due':
      return 'open'
    case 'closed':
    case 'failed':
      return 'uncollectible'
    case 'voided':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawRecurlyInvoice): Invoice {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.number,
    customerId: raw.account?.id,
    subscriptionId: raw.subscription_ids?.[0],
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    subtotal: decimalToMinor(raw.subtotal),
    tax: decimalToMinor(raw.tax),
    total: decimalToMinor(raw.total),
    amountPaid: decimalToMinor(raw.paid),
    amountDue: decimalToMinor(raw.balance),
    dueDate: raw.due_at,
    paidAt: raw.closed_at,
    gateway: 'recurly',
    metadata: strMap({}),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
