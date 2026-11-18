import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

// wFirma invoice content (line item) from /invoices/get or embedded in invoice
export interface WfirmaInvoiceContent {
  id?: number | string
  name?: string
  unit?: string
  count?: number | string
  price?: number | string
  netto?: number | string
  brutto?: number | string
  vat?: string
  discount_percent?: number | string
  good_id?: number | string
  [key: string]: unknown
}

export interface WfirmaInvoice {
  id?: number | string
  fullnumber?: string
  number?: number | string
  date?: string          // YYYY-MM-DD
  paymentdate?: string   // YYYY-MM-DD — due date
  paymentstate?: string  // 'paid' | 'unpaid' | 'undefined'
  paymentmethod?: string
  type?: string          // e.g. 'normal', 'proforma', 'correction'
  netto?: number | string
  brutto?: number | string  // total incl. tax
  tax?: number | string
  paid?: number | string
  remaining?: number | string
  currency?: string
  description?: string
  notes?: string
  alreadysent?: boolean
  contractor_id?: number | string
  series_id?: number | string
  created?: string
  modified?: string
  invoicecontents?: WfirmaInvoiceContent[]
  [key: string]: unknown
}

/** Parse an arbitrary upstream value as a decimal number; returns undefined on absent/NaN. */
function parseDecimal(v: number | string | undefined | null): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(v as string)
  return isNaN(n) ? undefined : n
}

/**
 * Convert a wFirma decimal PLN amount to canonical integer grosz (minor units).
 * wFirma always emits amounts as decimal strings/numbers (e.g. "123.45").
 * The canonical Amount schema requires integer minor units (e.g. 12345).
 */
function toMinorUnitsDecimal(v: number | string | undefined | null): number | undefined {
  return toMinorUnits(v)
}

/** Convert a raw upstream timestamp to a Date via toIsoDatetime for safe handling. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

function mapStatus(inv: WfirmaInvoice): InvoiceStatus {
  const state = (inv.paymentstate ?? '').toLowerCase()
  if (state === 'paid') return 'PAID'
  if (state === 'unpaid') {
    // Check if a due date has passed — we don't have a clock here so leave as AUTHORIZED
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapLineitem(row: WfirmaInvoiceContent): Lineitem {
  const nettoMinor = toMinorUnitsDecimal(row.netto)
  const bruttoMinor = toMinorUnitsDecimal(row.brutto)
  return {
    id: row.id !== undefined ? String(row.id) : undefined,
    itemId: row.good_id !== undefined ? String(row.good_id) : undefined,
    itemName: row.name || undefined,
    unitAmount: toMinorUnitsDecimal(row.price),
    unitQuantity: row.count !== undefined ? Math.round(parseDecimal(row.count) ?? 0) : undefined,
    totalAmount: bruttoMinor ?? nettoMinor,
    taxAmount: nettoMinor !== undefined && bruttoMinor !== undefined
      ? (bruttoMinor - nettoMinor) || undefined
      : undefined,
    // wFirma stores discount as percent, not absolute amount — omit
  }
}

export function transformInvoice(raw: WfirmaInvoice): Invoice {
  const invoiceType = (raw.type ?? '').toLowerCase()
  const canonicalType = invoiceType === 'correction' ? 'CREDITMEMO' : 'INVOICE'

  const contents = Array.isArray(raw.invoicecontents) ? raw.invoicecontents : []

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    type: canonicalType,
    status: mapStatus(raw),
    invoiceNumber: raw.fullnumber || (raw.number !== undefined ? String(raw.number) : undefined),
    contactId: raw.contractor_id !== undefined ? String(raw.contractor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnitsDecimal(raw.brutto),
    taxAmount: toMinorUnitsDecimal(raw.tax),
    paidAmount: toMinorUnitsDecimal(raw.paid),
    balanceAmount: toMinorUnitsDecimal(raw.remaining),
    notes: raw.notes || raw.description || undefined,
    lineItems: contents.length > 0 ? contents.map(mapLineitem) : undefined,
    postedAt: toDate(raw.date),
    dueAt: toDate(raw.paymentdate),
    createdAt: toDate(raw.created),
    updatedAt: toDate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Convert a canonical integer minor-unit amount back to a decimal PLN value
 * for writing to the wFirma API. Returns undefined when the input is absent.
 */
function fromMinorUnits(v: number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined
  return v / 100
}

/** Canonical Invoice → wFirma invoice body (for add/edit) */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    date: toCalendarDate(invoice.postedAt),
    paymentdate: toCalendarDate(invoice.dueAt),
    currency: invoice.currency,
    notes: invoice.notes,
    contractor_id: invoice.contactId ? Number(invoice.contactId) : undefined,
    invoicecontents: invoice.lineItems?.map((li) => ({
      name: li.itemName ?? li.itemDescription,
      count: li.unitQuantity,
      // Canonical amounts are integer minor units; wFirma expects decimal PLN.
      price: fromMinorUnits(li.unitAmount),
      good_id: li.itemId ? Number(li.itemId) : undefined,
    })),
  }
}
