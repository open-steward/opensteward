import { toCalendarDate } from '../../shared/transform'
/**
 * Fakturownia ↔ canonical Invoice transform.
 *
 * Fakturownia represents both receivable invoices (income=1) and expense
 * invoices (income=0) through the same /invoices endpoint.  We map the
 * full invoice (vat, proforma, etc.) to canonical Invoice.
 *
 * Key Fakturownia fields:
 *   id, number, kind, status (issued|sent|paid|partial|rejected),
 *   issue_date, sell_date, payment_to,
 *   price_net, price_gross, price_tax, paid,
 *   currency, client_id, buyer_name,
 *   positions[] { id, name, quantity, price_net, price_gross, tax, total_price_gross }
 *
 * Money: Fakturownia returns amounts in major currency units (e.g. 12.34 PLN).
 * Canonical Amount fields are integer minor units (e.g. 1234 = 12.34 PLN).
 * All monetary values are converted with toMinorUnits().
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Money helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a Fakturownia major-unit amount (e.g. 12.34) to canonical integer
 * minor units (e.g. 1234 cents).  Returns `undefined` for absent/NaN inputs.
 */
function toMinorUnits(val: number | string | undefined | null): number | undefined {
  if (val === undefined || val === null) return undefined
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  if (isNaN(n)) return undefined
  return Math.round(n * 100)
}

// ── Raw Fakturownia types ─────────────────────────────────────────────────────

export interface FakturowniaPosition {
  id?: number | string
  product_id?: number | string
  name?: string
  description?: string
  quantity?: number | string
  quantity_unit?: string
  price_net?: number | string
  price_gross?: number | string
  tax?: number | string
  total_price_net?: number | string
  total_price_gross?: number | string
  discount?: number | string
  discount_percent?: number | string
  [key: string]: unknown
}

export interface FakturowniaInvoice {
  id: number | string
  number?: string
  kind?: string
  status?: string
  issue_date?: string
  sell_date?: string
  payment_to?: string
  currency?: string
  price_net?: number | string
  price_gross?: number | string
  price_tax?: number | string
  paid?: number | string
  client_id?: number | string
  buyer_name?: string
  buyer_tax_no?: string
  description?: string
  income?: string | number | boolean
  positions?: FakturowniaPosition[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: FakturowniaInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'rejected') return 'VOIDED'
  if (s === 'sent' || s === 'issued') return 'AUTHORIZED'
  return 'DRAFT'
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapPosition(pos: FakturowniaPosition): Lineitem {
  const qty = pos.quantity != null ? Number(pos.quantity) : undefined
  const totalGrossMinor = toMinorUnits(pos.total_price_gross)
  const totalNetMinor = toMinorUnits(pos.total_price_net)
  const taxMinor =
    totalGrossMinor != null && totalNetMinor != null
      ? totalGrossMinor - totalNetMinor
      : undefined
  const discountMinor = toMinorUnits(pos.discount)

  return {
    id: pos.id != null ? String(pos.id) : undefined,
    itemId: pos.product_id != null ? String(pos.product_id) : undefined,
    itemDescription: pos.name || undefined,
    unitAmount: toMinorUnits(pos.price_net),
    unitQuantity: qty != null ? Math.round(qty) : undefined,
    totalAmount: totalGrossMinor,
    taxAmount: taxMinor != null && !isNaN(taxMinor) ? taxMinor : undefined,
    discountAmount: discountMinor,
    notes: pos.description || undefined,
  }
}

// ── Forward transform ─────────────────────────────────────────────────────────

export function transformInvoice(raw: FakturowniaInvoice): Invoice {
  const totalMinor = toMinorUnits(raw.price_gross)
  const taxMinor = toMinorUnits(raw.price_tax)
  const paidMinor = toMinorUnits(raw.paid)
  const balanceMinor =
    totalMinor != null && paidMinor != null ? totalMinor - paidMinor : undefined

  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: totalMinor,
    taxAmount: taxMinor,
    paidAmount: paidMinor,
    balanceAmount: balanceMinor,
    notes: raw.description || undefined,
    lineItems: Array.isArray(raw.positions) && raw.positions.length > 0
      ? raw.positions.map(mapPosition)
      : undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.payment_to ? new Date(raw.payment_to) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Reverse transform (canonical Invoice → Fakturownia request body) ──────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    kind: 'vat',
    client_id: invoice.contactId,
    currency: invoice.currency,
    issue_date: toCalendarDate(invoice.postedAt),
    payment_to: toCalendarDate(invoice.dueAt),
    description: invoice.notes,
    positions: invoice.lineItems?.map((li) => ({
      name: li.itemDescription,
      quantity: li.unitQuantity ?? 1,
      price_net: li.unitAmount,
      tax: '23',
    })),
  }
}
