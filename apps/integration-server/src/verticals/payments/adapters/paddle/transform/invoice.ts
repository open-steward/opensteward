/**
 * Paddle `Transaction` doubles as the invoice when `origin = web|api`.
 * v1 surfaces Paddle invoices as the same Transaction record but mapped
 * to the canonical Invoice schema for consumers that read /invoices.
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, strToMinor } from './shared'

export interface RawPaddleInvoice {
  id?: string
  invoice_number?: string
  customer_id?: string
  subscription_id?: string
  status?: string
  currency_code?: string
  details?: {
    totals?: { subtotal?: string; tax?: string; total?: string; balance?: string }
  }
  invoice_id?: string
  created_at?: string
  updated_at?: string
  billed_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPaddleInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'completed':
    case 'paid':
      return 'paid'
    case 'billed':
    case 'ready':
      return 'open'
    case 'draft':
      return 'draft'
    case 'canceled':
      return 'void'
    case 'past_due':
      return 'uncollectible'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawPaddleInvoice): Invoice {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.invoice_number,
    customerId: raw.customer_id,
    subscriptionId: raw.subscription_id,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency_code),
    subtotal: strToMinor(raw.details?.totals?.subtotal),
    tax: strToMinor(raw.details?.totals?.tax),
    total: strToMinor(raw.details?.totals?.total),
    amountDue: strToMinor(raw.details?.totals?.balance),
    gateway: 'paddle',
    metadata: strMap({}),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
