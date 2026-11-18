import { requireAmount } from '@opensteward/shared'

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toIso } from './shared'

export interface RawChargebeeInvoice {
  id?: string
  customer_id?: string
  subscription_id?: string
  status?: string
  currency_code?: string
  sub_total?: number
  tax?: number
  total?: number
  amount_paid?: number
  amount_due?: number
  amount_adjusted?: number
  due_date?: number
  paid_at?: number
  date?: number
  updated_at?: number
  line_items?: Array<{ id?: string }>
  [k: string]: unknown
}

function mapStatus(raw: RawChargebeeInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'pending':
    case 'posted':
    case 'payment_due':
      return 'open'
    case 'voided':
      return 'void'
    case 'not_paid':
      return 'uncollectible'
    case 'draft':
      return 'draft'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawChargebeeInvoice): Invoice {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id,
    subscriptionId: raw.subscription_id,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency_code),
    subtotal: raw.sub_total,
    tax: raw.tax,
    total: requireAmount(raw.total, 'chargebee invoice'),
    amountPaid: raw.amount_paid,
    amountDue: raw.amount_due,
    dueDate: toIso(raw.due_date),
    paidAt: toIso(raw.paid_at),
    lineItemIds: raw.line_items?.map((l) => String(l.id ?? '')).filter(Boolean),
    gateway: 'chargebee',
    metadata: strMap({}),
    createdAt: toIso(raw.date),
    updatedAt: toIso(raw.updated_at),
    raw,
  }
}
