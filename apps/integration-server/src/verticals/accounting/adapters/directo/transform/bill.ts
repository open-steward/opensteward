/**
 * Directo purchase invoice transform (maps to canonical Bill).
 *
 * Endpoint: GET /v1/purchase_invoices
 * Single: GET /v1/purchase_invoices?number=<n>
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

// ── Directo wire types ────────────────────────────────────────────────────────

export interface DirectoPurchaseInvoiceRow {
  rn?: number           // row number
  account?: string      // GL account (mandatory per Directo docs)
  name?: string         // line description
  item?: string         // item code
  quantity?: number
  price?: number
  vatcode?: string
  project?: string
  sum?: number          // line total incl. VAT
  linetotalwovat?: number  // line total excl. VAT
  [key: string]: unknown
}

export interface DirectoPurchaseInvoice {
  number?: string | number       // document number
  suppliercode?: string          // supplier code
  suppliername?: string          // supplier display name
  supplierinvoiceno?: string     // supplier's own invoice number
  date?: string                  // invoice date ISO-8601
  duedate?: string               // due date ISO-8601
  currency?: string              // ISO-4217
  currencyrate?: number
  sum?: number                   // total incl. VAT
  vatsum?: number                // VAT amount
  sumwovat?: number              // total excl. VAT
  balance?: number               // outstanding balance
  status?: string                // document status
  vatzone?: number               // 0=local, 1=EU, 2=export
  rows?: DirectoPurchaseInvoiceRow[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: DirectoPurchaseInvoice): BillStatus {
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
  return 'DRAFT'
}

// ── Line item mapping ─────────────────────────────────────────────────────────

function mapLineitem(row: DirectoPurchaseInvoiceRow): Lineitem {
  return {
    id: row.rn !== undefined ? String(row.rn) : undefined,
    accountId: row.account || undefined,
    itemId: row.item || undefined,
    itemDescription: row.name || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.sum,
  }
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformBill(raw: DirectoPurchaseInvoice): Bill {
  return {
    id: raw.number !== undefined ? String(raw.number) : undefined,
    status: mapStatus(raw),
    billNumber: raw.supplierinvoiceno || undefined,
    contactId: raw.suppliercode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vatsum,
    balanceAmount: raw.balance,
    lineItems: Array.isArray(raw.rows) ? raw.rows.map(mapLineitem) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.duedate ? new Date(raw.duedate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
