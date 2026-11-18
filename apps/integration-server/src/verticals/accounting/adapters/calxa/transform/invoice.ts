import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

/**
 * Calxa invoice line item as returned by GET /invoices/:id.
 */
export interface CalxaInvoiceLine {
  /** Line identifier. */
  id?: string
  /** Account code this line is coded to. */
  accountId?: string
  /** Description of the item or service. */
  description?: string
  /** Unit price (before tax), in the invoice currency. */
  unitAmount?: number
  /** Quantity. */
  quantity?: number
  /** Total amount for this line (unitAmount × quantity). */
  lineAmount?: number
  /** Tax amount for this line. */
  taxAmount?: number
  [key: string]: unknown
}

/**
 * Calxa invoice record as returned by GET /invoices and GET /invoices/:id.
 */
export interface CalxaInvoice {
  id: string
  /** Human-readable invoice number. */
  invoiceNumber?: string
  /** Identifier of the contact (customer) being invoiced. */
  contactId?: string
  /** Lifecycle status: "draft" | "authorised" | "paid" | "voided" | "deleted". */
  status?: string
  /** ISO 4217 currency code. */
  currency?: string
  /** Grand total including tax. */
  total?: number
  /** Total tax component. */
  totalTax?: number
  /** Outstanding balance. */
  amountDue?: number
  /** Amount paid so far. */
  amountPaid?: number
  /** Customer-facing reference (e.g. PO number). */
  reference?: string
  lineItems?: CalxaInvoiceLine[]
  /** ISO 8601 invoice date. */
  date?: string
  /** ISO 8601 due date. */
  dueDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'authorised':
    case 'authorized':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
    case 'void':
      return 'VOIDED'
    case 'deleted':
      return 'DELETED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: CalxaInvoiceLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount ?? undefined,
    unitQuantity: line.quantity ?? undefined,
    totalAmount: line.lineAmount ?? undefined,
    taxAmount: line.taxAmount ?? undefined,
  }
}

export function transformInvoice(raw: CalxaInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.totalTax ?? undefined,
    balanceAmount: raw.amountDue ?? undefined,
    paidAmount: raw.amountPaid ?? undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
