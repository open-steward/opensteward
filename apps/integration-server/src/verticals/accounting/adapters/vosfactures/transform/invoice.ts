/**
 * VosFactures → canonical Invoice transform.
 *
 * VosFactures calls all documents "invoices" and distinguishes them by `kind`:
 *   vat / advance / final / correction / estimate / proforma / client_order /
 *   receipt / invoice_other
 *
 * Income invoices (income=1) are AR; expense invoices (income=0) are AP.
 *
 * Status values: issued | sent | paid | partial | rejected | accepted
 *
 * Amounts are major-unit decimals in the document's `currency` and are
 * reported in minor units of that currency (../money.ts names the fields and
 * the README passages they come from). The write path converts back.
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { Invoice, InvoiceStatus, InvoiceType } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toCalendarDate } from '../../shared/transform'
import { documentAmounts, minorToVosFactures, positionQuantity, vosfacturesToMinor } from '../money'

// ── VosFactures raw shapes ─────────────────────────────────────────────────

export interface VosFacturesPosition {
  id?: number
  product_id?: number
  name?: string
  description?: string
  quantity?: string | number
  quantity_unit?: string
  /** "prix unitaire HT". */
  price_net?: string | number
  /** "prix unitaire TTC". */
  price_gross?: string | number
  /** "% de taxe" — a rate, not an amount. */
  tax?: string | number
  discount?: string | number
  discount_percent?: string | number
  /** "total TTC". */
  total_price_gross?: string | number
  /** "total HT". */
  total_price_net?: string | number
  [key: string]: unknown
}

export interface VosFacturesInvoice {
  id: number
  number?: string
  kind?: string // vat, advance, final, correction, estimate, proforma, client_order, receipt
  status?: string // issued, sent, paid, partial, rejected, accepted
  income?: string | number | boolean // "1" = sale, "0" = expense
  issue_date?: string // YYYY-MM-DD
  payment_to?: string // due date YYYY-MM-DD
  sell_date?: string
  currency?: string
  /** "total HT" (README `order=` sort keys). */
  price_net?: string | number
  /** "total TTC" (README `order=` sort keys). */
  price_gross?: string | number
  /** "total de Taxe" (README `order=` sort keys). */
  price_tax?: string | number
  /** "montant payé" (README "Liste des champs principaux", e.g. "0,00"). */
  paid?: string | number
  client_id?: number
  buyer_name?: string
  buyer_email?: string
  description?: string
  internal_note?: string
  payment_type?: string
  positions?: VosFacturesPosition[]
  /** ID of the functionally linked reference document; on a correction, the corrected invoice. */
  invoice_id?: string | number | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mapStatus(raw: VosFacturesInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'paid':
      return 'PAID'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'sent':
      return 'AUTHORIZED'
    case 'accepted':
      return 'AUTHORIZED'
    case 'rejected':
      return 'VOIDED'
    case 'issued':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

function mapType(raw: VosFacturesInvoice): InvoiceType {
  if (raw.kind === 'correction') return 'CREDITMEMO'
  const isExpense = String(raw.income) === '0'
  return isExpense ? 'BILL' : 'INVOICE'
}

/**
 * One `positions` entry, amounts in minor units of the document's currency.
 * `price_net` is "prix unitaire HT", `total_price_gross` "total TTC" and
 * `total_price_net` "total HT" (README "Liste des champs principaux"); the
 * line's tax is the difference of the two totals. A position's `tax` is a
 * rate ("% de taxe"), so it is never read as an amount.
 */
export function mapPosition(pos: VosFacturesPosition, currency: string | undefined): Lineitem {
  const totalAmount = vosfacturesToMinor(pos.total_price_gross, currency)
  const netTotal = vosfacturesToMinor(pos.total_price_net, currency)
  return {
    id: pos.id !== undefined ? String(pos.id) : undefined,
    itemId: pos.product_id !== undefined ? String(pos.product_id) : undefined,
    itemName: pos.name || undefined,
    itemDescription: pos.description || undefined,
    unitAmount: vosfacturesToMinor(pos.price_net, currency),
    unitQuantity: positionQuantity(pos.quantity),
    taxAmount:
      totalAmount !== undefined && netTotal !== undefined ? totalAmount - netTotal : undefined,
    totalAmount,
  }
}

// ── Public transform ──────────────────────────────────────────────────────

export function transformInvoice(raw: VosFacturesInvoice): Invoice {
  const currency = raw.currency || undefined
  const { totalAmount, taxAmount, paidAmount, balanceAmount } = documentAmounts(raw, currency)

  return {
    id: String(raw.id),
    type: mapType(raw),
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    currency,
    totalAmount,
    taxAmount,
    paidAmount,
    balanceAmount,
    notes: raw.description || undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.payment_to ? new Date(raw.payment_to) : undefined,
    lineItems: Array.isArray(raw.positions)
      ? raw.positions.map((pos) => mapPosition(pos, currency))
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Reverse transform (canonical → VosFactures body) ─────────────────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    kind: invoice.type === 'BILL' ? 'vat' : invoice.type === 'CREDITMEMO' ? 'correction' : 'vat',
    income: invoice.type === 'BILL' ? '0' : '1',
    client_id: invoice.contactId ? Number(invoice.contactId) : undefined,
    currency: invoice.currency,
    issue_date: toCalendarDate(invoice.postedAt),
    payment_to: toCalendarDate(invoice.dueAt),
    description: invoice.notes,
    positions: invoice.lineItems?.map((li) => ({
      product_id: li.itemId ? Number(li.itemId) : undefined,
      name: li.itemName,
      description: li.itemDescription,
      quantity: li.unitQuantity,
      // "prix unitaire HT" is a major-unit decimal; the canonical unit amount
      // is minor units, converted back by the invoice's currency.
      price_net: minorToVosFactures(li.unitAmount, invoice.currency),
    })),
  }
}
