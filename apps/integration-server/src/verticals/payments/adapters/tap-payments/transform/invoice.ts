import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Tap invoice object — https://developers.tap.company/reference/invoices
 *
 * Endpoints:
 *   POST /v2/invoices/list        — list invoices (cursor-paginated)
 *   GET  /v2/invoices/{invoice_id} — retrieve a single invoice
 *   POST /v2/invoices             — create invoice
 *   PUT  /v2/invoices/{invoice_id} — update invoice
 *
 * Tap invoice statuses: SAVED, CREATED, CANCELLED, EXPIRED, PAID.
 */
export interface RawTapInvoice {
  id?: string
  object?: string
  status?: string
  /** The amount shown on the invoice (decimal major units). */
  amount?: number | string
  currency?: string
  description?: string | null
  note?: string | null
  draft?: boolean
  /** Unix timestamp for the invoice due date. */
  due?: number | string
  /** Unix timestamp for invoice expiry. */
  expiry?: number | string
  customer?: {
    id?: string
    first_name?: string
    last_name?: string
    email?: string
  }
  order?: { id?: string; amount?: number | string; currency?: string }
  charge?: { id?: string }
  metadata?: Record<string, unknown>
  /** Unix timestamp when the invoice was created. */
  created?: number | string
  /** Unix timestamp when the invoice was last updated. */
  updated?: number | string
  /** Statement descriptor shown on bank statements. */
  statement_descriptor?: string | null
  /** Track object with latest status / full activity log. */
  track?: { status?: string; time?: number | string }
  [k: string]: unknown
}

/**
 * Tap invoice statuses → canonical InvoiceStatus:
 *   SAVED       → draft
 *   CREATED     → open
 *   PAID        → paid
 *   CANCELLED   → void
 *   EXPIRED     → void
 */
function mapStatus(raw: RawTapInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SAVED':
      return 'draft'
    case 'CREATED':
      return 'open'
    case 'PAID':
      return 'paid'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawTapInvoice): Invoice {
  const currency = pickCurrency(raw.currency ?? raw.order?.currency)
  const status = mapStatus(raw)
  const totalMinor = toMinorUnits(raw.amount ?? raw.order?.amount, currency)
  const paidAt =
    status === 'paid' ? toIsoDatetime(raw.track?.time ?? raw.updated) : undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer?.id ? String(raw.customer.id) : undefined,
    status,
    currency,
    total: totalMinor,
    amountDue: status === 'paid' ? 0 : totalMinor,
    amountPaid: status === 'paid' ? totalMinor : 0,
    amountRemaining: status === 'paid' ? 0 : totalMinor,
    dueDate: raw.due != null ? toIsoDatetime(Number(raw.due) * 1000) : undefined,
    paidAt,
    hostedInvoiceUrl: undefined,
    gateway: 'tap-payments',
    metadata: strMap({
      ...raw.metadata,
      statement_descriptor: raw.statement_descriptor,
      charge_id: raw.charge?.id,
      order_id: raw.order?.id,
      note: raw.note,
    }),
    createdAt: raw.created != null ? toIsoDatetime(Number(raw.created) * 1000) : undefined,
    updatedAt: raw.updated != null ? toIsoDatetime(Number(raw.updated) * 1000) : undefined,
    raw,
  }
}
