import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap } from './shared'

export interface RawSquareInvoice {
  id?: string
  invoice_number?: string
  primary_recipient?: { customer_id?: string }
  status?: string
  payment_requests?: Array<{
    request_method?: string
    request_type?: string
    due_date?: string
    computed_amount_money?: { amount?: number; currency?: string }
  }>
  next_payment_due_date?: string
  payment_amount_due?: { amount?: number; currency?: string }
  amount_paid?: { amount?: number; currency?: string }
  public_url?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSquareInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'DRAFT':
      return 'draft'
    case 'PAID':
      return 'paid'
    case 'CANCELED':
      return 'void'
    case 'PAYMENT_PENDING':
    case 'UNPAID':
    case 'SCHEDULED':
    case 'PARTIALLY_PAID':
      return 'open'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawSquareInvoice): Invoice {
  const total =
    raw.payment_requests?.reduce(
      (sum, p) => sum + (p.computed_amount_money?.amount ?? 0),
      0,
    ) ?? 0
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.invoice_number,
    customerId: raw.primary_recipient?.customer_id,
    status: mapStatus(raw),
    currency: pickCurrency(raw.payment_amount_due?.currency),
    total,
    amountDue: raw.payment_amount_due?.amount,
    amountPaid: raw.amount_paid?.amount,
    dueDate: raw.next_payment_due_date,
    hostedInvoiceUrl: raw.public_url,
    gateway: 'square',
    metadata: strMap({}),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
