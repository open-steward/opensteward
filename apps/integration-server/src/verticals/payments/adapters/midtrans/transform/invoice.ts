/**
 * Midtrans Invoice API — `POST /v1/invoices` / `GET /v1/invoices/{id}`.
 *
 * Midtrans invoices are created and fetched via the Core API base URL. The
 * invoice object carries `order_id` (merchant reference), `id` (Midtrans id),
 * `invoice_number`, `status`, `gross_amount` (integer, major units), and
 * ISO-8601 date strings (GMT+7). Line items live under `item_details`.
 *
 * There is no list-invoices endpoint; invoices are fetched by id.
 *
 * Status mapping:
 *   draft      → draft
 *   pending    → open
 *   published  → open
 *   paid       → paid
 *   voided     → void
 *   expired    → void
 *   overdue    → open (still collectable)
 *   rejected   → void
 *   canceled   → void
 *
 * Refs:
 *   https://docs.midtrans.com/reference/create-invoice
 *   https://docs.midtrans.com/reference/get-invoice
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawMidtransInvoiceItem {
  item_id?: string
  description?: string
  quantity?: number
  price?: number
  [k: string]: unknown
}

export interface RawMidtransInvoice {
  id?: string
  order_id?: string
  invoice_number?: string
  status?: string
  gross_amount?: number | string
  currency?: string
  due_date?: string
  invoice_date?: string
  published_date?: string
  pdf_url?: string
  payment_link_url?: string
  customer_details?: {
    id?: string
    [k: string]: unknown
  }
  item_details?: RawMidtransInvoiceItem[]
  tax_mode?: string
  taxes?: Array<{ name?: string; calculated_amount?: number; [k: string]: unknown }>
  reference?: string
  notes?: string
  [k: string]: unknown
}

function mapStatus(raw: RawMidtransInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'pending':
    case 'published':
    case 'overdue':
      return 'open'
    case 'paid':
      return 'paid'
    case 'voided':
    case 'expired':
    case 'rejected':
    case 'canceled':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawMidtransInvoice): Invoice {
  const currency = pickCurrency(raw.currency)
  // gross_amount from invoice API is an integer (major units without decimals)
  // so we treat it as an integer and scale ×100 to get minor units.
  const grossMinor =
    raw.gross_amount != null
      ? typeof raw.gross_amount === 'number'
        ? Math.round(raw.gross_amount * 100)
        : toMinorUnits(raw.gross_amount)
      : 0
  const taxTotal = (raw.taxes ?? []).reduce(
    (acc, t) => acc + (t.calculated_amount != null ? Math.round(t.calculated_amount * 100) : 0),
    0,
  )
  return {
    id: String(raw.id ?? raw.order_id ?? ''),
    externalId: String(raw.id ?? raw.order_id ?? ''),
    number: raw.invoice_number ?? undefined,
    customerId: raw.customer_details?.id ? String(raw.customer_details.id) : undefined,
    status: mapStatus(raw),
    currency,
    total: grossMinor,
    tax: taxTotal || undefined,
    dueDate: toIsoDatetime(raw.due_date),
    paidAt: raw.status?.toLowerCase() === 'paid' ? toIsoDatetime(raw.published_date) : undefined,
    hostedInvoiceUrl: raw.payment_link_url ?? undefined,
    invoicePdfUrl: raw.pdf_url ?? undefined,
    gateway: 'midtrans',
    metadata: strMap({
      order_id: raw.order_id,
      reference: raw.reference,
      notes: raw.notes,
      tax_mode: raw.tax_mode,
    }),
    createdAt: toIsoDatetime(raw.published_date ?? raw.invoice_date),
    updatedAt: toIsoDatetime(raw.published_date ?? raw.invoice_date),
    raw,
  }
}
