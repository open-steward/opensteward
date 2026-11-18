import { toCalendarDate } from '../../shared/transform'
/**
 * Directo invoice transform.
 *
 * Directo REST API endpoint: GET /v1/invoices
 * Single record: GET /v1/invoices?number=<n>
 * Field names follow Directo's snake_case convention.
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Directo wire types ────────────────────────────────────────────────────────

export interface DirectoInvoiceRow {
  rn?: number           // row number
  item?: string         // item code
  description?: string  // line description
  price?: number        // unit price excl. VAT
  quantity?: number     // quantity
  discount?: number     // percentage discount
  vatcode?: string      // VAT code
  account?: string      // GL account code
  sum?: number          // line total incl. VAT
  [key: string]: unknown
}

export interface DirectoInvoice {
  number?: string | number   // invoice number (unique document ID)
  date?: string              // invoice date ISO-8601
  duedate?: string           // due date ISO-8601
  customercode?: string      // customer code
  customername?: string      // customer display name
  currency?: string          // ISO-4217 currency code
  currencyrate?: number      // exchange rate
  sum?: number               // total incl. VAT
  vatsum?: number            // total VAT
  sumwovat?: number          // total excl. VAT
  balance?: number           // outstanding balance
  status?: string            // document status string
  paymentterm?: string       // payment term code
  reference?: string         // payment reference number
  project?: string           // project code
  rows?: DirectoInvoiceRow[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: DirectoInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  if (raw.balance !== undefined && raw.balance === 0 && raw.sum !== undefined && raw.sum !== 0)
    return 'PAID'
  if (
    raw.balance !== undefined &&
    raw.sum !== undefined &&
    raw.balance > 0 &&
    raw.balance < raw.sum
  )
    return 'PARTIALLY_PAID'
  if (s === 'confirmed' || s === 'booked') return 'AUTHORIZED'
  if (s === 'draft' || s === '') return 'DRAFT'
  return 'AUTHORIZED'
}

// ── Line item mapping ─────────────────────────────────────────────────────────

function mapLineitem(row: DirectoInvoiceRow): Lineitem {
  return {
    id: row.rn !== undefined ? String(row.rn) : undefined,
    accountId: row.account || undefined,
    itemId: row.item || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.sum,
    discountAmount: row.discount || undefined,
  }
}

// ── Public transforms ─────────────────────────────────────────────────────────

export function transformInvoice(raw: DirectoInvoice): Invoice {
  return {
    id: raw.number !== undefined ? String(raw.number) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number !== undefined ? String(raw.number) : undefined,
    contactId: raw.customercode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vatsum,
    balanceAmount: raw.balance,
    reference: raw.reference || undefined,
    notes: raw.paymentterm || undefined,
    lineItems: Array.isArray(raw.rows) ? raw.rows.map(mapLineitem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.duedate ? new Date(raw.duedate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Invoice → Directo body (for create/update)
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customercode: invoice.contactId,
    currency: invoice.currency,
    date: toCalendarDate(invoice.postedAt),
    duedate: toCalendarDate(invoice.dueAt),
    reference: invoice.reference,
    rows: invoice.lineItems?.map((li) => ({
      item: li.itemId,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
      account: li.accountId,
      discount: li.discountAmount,
    })),
  }
}
