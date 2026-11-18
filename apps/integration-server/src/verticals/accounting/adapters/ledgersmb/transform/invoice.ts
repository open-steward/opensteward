import { toCalendarDate } from '../../shared/transform'
/**
 * LedgerSMB invoice transform.
 *
 * API resource: GET /invoices/{id}, POST /invoices
 *
 * LedgerSMB invoice response shape (v0 REST API):
 *   id            — transaction id (integer as string)
 *   type          — 'customer' | 'vendor'
 *   currency      — 3-char ISO 4217 code
 *   description   — optional memo
 *   notes         — public notes
 *   internal-notes — private notes
 *   invoice-number, order-number, po-number — reference numbers
 *   dates.book    — transaction/invoice date (ISO date string)
 *   dates.due     — due date (ISO date string)
 *   dates.created — creation timestamp
 *   lines_total   — net line total
 *   taxes_total   — total tax
 *   total         — grand total (lines_total + taxes_total)
 *   amount        — base amount
 *   netamount     — net amount
 *   amount_tc     — transaction-currency total
 *   eca           — entity credit account (customer/vendor reference)
 *     eca.id, eca.number, eca.type, eca.description
 *   lines[]       — line items
 *     lines[].id, description, qty, price, total, discount, discount_type
 *     lines[].part.number, part.description, part.unit
 *   taxes{}       — keyed by accno; each: { tax.rate, base-amount, amount }
 *   workflow.state — INITIAL | SAVED | POSTED | ONHOLD | VOIDED | REVERSED | DELETED
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface LedgerSMBTax {
  tax: { category?: string; name?: string; rate?: number }
  'base-amount'?: number
  'calculated-amount'?: number
  amount?: number
  source?: string
  memo?: string
}

export interface LedgerSMBInvoiceLine {
  id?: string | number
  description?: string
  notes?: string
  qty?: number
  price?: number
  total?: number
  discount?: number
  discount_type?: string
  part?: {
    number?: string
    description?: string
    unit?: string
  }
  [key: string]: unknown
}

export interface LedgerSMBInvoiceDates {
  book?: string
  due?: string
  created?: string
}

export interface LedgerSMBInvoiceECA {
  id?: number | string
  number?: string
  type?: 'customer' | 'vendor'
  description?: string
  pay_to_name?: string
  entity?: { name?: string; control_code?: string }
}

export interface LedgerSMBInvoiceWorkflow {
  state?: string
}

export interface LedgerSMBInvoice {
  id?: string | number
  type?: 'customer' | 'vendor'
  currency?: string
  description?: string
  notes?: string
  'internal-notes'?: string
  'invoice-number'?: string
  'order-number'?: string
  'po-number'?: string
  'quote-number'?: string
  'ship-via'?: string
  'shipping-point'?: string
  lines_total?: number
  taxes_total?: number
  total?: number
  amount?: number
  netamount?: number
  amount_tc?: number
  netamount_tc?: number
  dates?: LedgerSMBInvoiceDates
  eca?: LedgerSMBInvoiceECA
  lines?: LedgerSMBInvoiceLine[]
  taxes?: Record<string, LedgerSMBTax>
  workflow?: LedgerSMBInvoiceWorkflow
  [key: string]: unknown
}

function mapWorkflowStatus(state: string | undefined, invType: string | undefined): InvoiceStatus {
  if (!state) return 'DRAFT'
  const s = state.toUpperCase()
  if (s === 'VOIDED' || s === 'REVERSED') return 'VOIDED'
  if (s === 'DELETED') return 'DELETED'
  if (s === 'ONHOLD') return 'AUTHORIZED'
  if (s === 'POSTED') {
    // For vendor invoices (bills) treated as invoices, POSTED = authorized
    return invType === 'vendor' ? 'AUTHORIZED' : 'AUTHORIZED'
  }
  if (s === 'SAVED') return 'DRAFT'
  if (s === 'INITIAL') return 'DRAFT'
  return 'DRAFT'
}

/** Convert a decimal monetary value from LedgerSMB to integer minor units (cents). */
function toMinor(v: number | undefined | null): number | undefined {
  if (v == null) return undefined
  return Math.round(v * 100)
}

function mapLineitem(line: LedgerSMBInvoiceLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    itemId: line.part?.number || undefined,
    itemName: line.part?.description || undefined,
    itemDescription: line.description || undefined,
    unitAmount: toMinor(line.price),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    totalAmount: toMinor(line.total),
    discountAmount: toMinor(line.discount),
  }
}

export function transformInvoice(raw: LedgerSMBInvoice): Invoice {
  const workflowState = raw.workflow?.state
  const status = mapWorkflowStatus(workflowState, raw.type)

  // Sum taxes from the taxes map; convert to minor units
  let taxAmount: number | undefined
  if (raw.taxes && Object.keys(raw.taxes).length > 0) {
    taxAmount = Math.round(
      Object.values(raw.taxes).reduce((sum, t) => sum + (t.amount ?? 0), 0) * 100,
    )
  } else if (raw.taxes_total != null) {
    taxAmount = toMinor(raw.taxes_total)
  }

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    type: raw.type === 'vendor' ? 'BILL' : 'INVOICE',
    status,
    invoiceNumber: raw['invoice-number'] || undefined,
    contactId: raw.eca?.id != null ? String(raw.eca.id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinor(raw.total ?? raw.amount_tc),
    taxAmount: taxAmount ?? undefined,
    notes: raw.notes || undefined,
    reference: raw['po-number'] || raw['order-number'] || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.dates?.book ? new Date(raw.dates.book) : undefined,
    dueAt: raw.dates?.due ? new Date(raw.dates.due) : undefined,
    createdAt: raw.dates?.created ? new Date(raw.dates.created) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Canonical Invoice → LedgerSMB newInvoice body (for POST /invoices).
 *
 * Required by LedgerSMB: eca, account, currency, dates.book, lines[].part.number
 */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    eca: invoice.contactId ? { id: invoice.contactId } : undefined,
    currency: invoice.currency,
    description: invoice.notes,
    notes: invoice.notes,
    'invoice-number': invoice.invoiceNumber,
    'po-number': invoice.reference,
    dates: {
      book: toCalendarDate(invoice.postedAt),
      due: toCalendarDate(invoice.dueAt),
    },
    lines: invoice.lineItems?.map((li) => ({
      description: li.itemDescription ?? li.itemName,
      qty: li.unitQuantity,
      price: li.unitAmount,
      part: li.itemId ? { number: li.itemId } : undefined,
    })),
  }
}
