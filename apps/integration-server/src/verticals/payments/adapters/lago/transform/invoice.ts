/**
 * Lago Invoice ↔ canonical Invoice.
 *
 * Lago tracks two orthogonal states: `status` (draft / finalized / voided /
 * pending / failed — the document lifecycle) and `payment_status` (pending /
 * succeeded / failed). We fold both into the canonical `InvoiceStatus`:
 * `voided`/`finalized+paid`/`open` etc. All money is integer cents in
 * `*_amount_cents` fields; the customer link is carried on a nested `customer`
 * object keyed by `external_id`. `issuing_date` is an ISO date.
 *
 * Docs: https://getlago.com/docs/api-reference/invoices/invoice-object
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap } from './shared'

export interface RawLagoInvoice {
  lago_id?: string
  sequential_id?: number
  number?: string | null
  issuing_date?: string | null
  payment_due_date?: string | null
  invoice_type?: string | null
  status?: string | null
  payment_status?: string | null
  payment_overdue?: boolean
  currency?: string | null
  fees_amount_cents?: number
  coupons_amount_cents?: number
  credit_notes_amount_cents?: number
  sub_total_excluding_taxes_amount_cents?: number
  taxes_amount_cents?: number
  sub_total_including_taxes_amount_cents?: number
  prepaid_credit_amount_cents?: number
  total_amount_cents?: number
  file_url?: string | null
  customer?: { external_id?: string; lago_id?: string } | null
  metadata?: Array<{ key?: string; value?: unknown }> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawLagoInvoice): InvoiceStatus {
  const status = (raw.status ?? '').toLowerCase()
  const payment = (raw.payment_status ?? '').toLowerCase()
  if (status === 'draft') return 'draft'
  if (status === 'voided') return 'void'
  if (payment === 'succeeded') return 'paid'
  if (status === 'failed' || payment === 'failed') return 'uncollectible'
  // `finalized` / `pending` documents awaiting payment are canonically "open".
  return 'open'
}

export function transformInvoice(raw: RawLagoInvoice): Invoice {
  const id = String(raw.lago_id ?? '')
  return {
    id,
    externalId: id,
    number: raw.number ?? undefined,
    customerId: raw.customer?.external_id ?? raw.customer?.lago_id ?? undefined,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency) ?? 'USD',
    subtotal: raw.sub_total_excluding_taxes_amount_cents,
    tax: raw.taxes_amount_cents,
    total: raw.total_amount_cents ?? 0,
    amountDue: raw.total_amount_cents,
    amountPaid:
      (raw.payment_status ?? '').toLowerCase() === 'succeeded'
        ? raw.total_amount_cents
        : undefined,
    dueDate: toIsoDatetime(raw.payment_due_date),
    invoicePdfUrl: raw.file_url ?? undefined,
    gateway: 'lago',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.issuing_date ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
