import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Crunch wire types ─────────────────────────────────────────────────────────

export interface CrunchInvoiceLineItem {
  id?: number
  description?: string
  quantity?: number
  rate?: number
  priceExclVat?: number
  vatRate?: string
  amount?: number
  vatAmountCharged?: number
  vatAmountDue?: number
}

export interface CrunchCustomerRef {
  id?: number
  name?: string
  email?: string
}

/** Full invoice object returned from GET /invoices/{id} */
export interface CrunchInvoice {
  id?: number
  customer?: CrunchCustomerRef
  issuedDate?: string
  dueDate?: string
  currency?: string
  reference?: string
  netAmount?: number
  vatAmount?: number
  grossAmount?: number
  status?: string
  outstandingBalance?: number
  items?: CrunchInvoiceLineItem[]
  payments?: Array<{ id?: number; date?: string; amount?: number; reconciled?: boolean }>
  creditNotes?: Array<{ id?: number; date?: string; amount?: number; state?: string }>
  note?: { id?: number; text?: string }
  purchaseOrder?: string
  deletable?: boolean
  [key: string]: unknown
}

/** Lightweight list item from GET /invoices/ `content` array (SalesInvoiceStateDto) */
export interface CrunchInvoiceState {
  id?: number
  invoiceNumber?: string
  customerName?: string
  customerId?: number
  reference?: string
  netAmount?: number
  vatAmount?: number
  grossAmount?: number
  currency?: string
  status?: string
  outstandingBalance?: number
  totalCreditsAmount?: number
  issuedDate?: string
  dueDate?: string
  deletable?: boolean
  [key: string]: unknown
}

// ── Status mapping ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, InvoiceStatus> = {
  DRAFT: 'DRAFT',
  ISSUED: 'AUTHORIZED',
  SETTLED: 'PAID',
  VOIDED: 'VOIDED',
  DELETED: 'DELETED',
  OVERDUE: 'OVERDUE',
}

function mapStatus(raw: string | undefined): InvoiceStatus {
  if (!raw) return 'DRAFT'
  const upper = raw.toUpperCase()
  const mapped = STATUS_MAP[upper]
  if (mapped) return mapped
  if (upper.includes('PARTIAL')) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

// ── Currency normalisation ────────────────────────────────────────────────────

/** Map Crunch currency enum strings to ISO 4217 codes where needed. */
function normalizeCurrency(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const MAP: Record<string, string> = {
    POUND_STERLING: 'GBP',
    EURO: 'EUR',
    UNITED_STATES_DOLLAR: 'USD',
    AUSTRALIAN_DOLLAR: 'AUD',
    CANADIAN_DOLLAR: 'CAD',
  }
  return MAP[raw] ?? raw
}

// ── Line item transform ───────────────────────────────────────────────────────

function mapLineItems(items: CrunchInvoiceLineItem[] | undefined): Lineitem[] {
  return (items ?? []).map((item) => ({
    id: item.id !== undefined ? String(item.id) : undefined,
    itemDescription: item.description ?? undefined,
    unitAmount: item.rate !== undefined ? Math.round(item.rate * 100) : undefined,
    unitQuantity: item.quantity !== undefined ? Math.round(item.quantity) : undefined,
    taxAmount:
      item.vatAmountCharged !== undefined ? Math.round(item.vatAmountCharged * 100) : undefined,
    totalAmount: item.amount !== undefined ? Math.round(item.amount * 100) : undefined,
  }))
}

// ── Full invoice transform ────────────────────────────────────────────────────

export function transformInvoice(raw: CrunchInvoice): Invoice {
  const gross = raw.grossAmount ?? 0
  const outstanding = raw.outstandingBalance ?? 0
  const paid = gross - outstanding

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    contactId: raw.customer?.id !== undefined ? String(raw.customer.id) : undefined,
    currency: normalizeCurrency(raw.currency),
    totalAmount: gross !== 0 ? Math.round(gross * 100) : undefined,
    taxAmount: raw.vatAmount !== undefined ? Math.round(raw.vatAmount * 100) : undefined,
    paidAmount: paid > 0 ? Math.round(paid * 100) : undefined,
    balanceAmount: outstanding !== 0 ? Math.round(outstanding * 100) : undefined,
    reference: raw.reference ?? raw.purchaseOrder ?? undefined,
    notes: raw.note?.text ?? undefined,
    lineItems: mapLineItems(raw.items),
    postedAt: raw.issuedDate ? new Date(raw.issuedDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Transform the lightweight list item (SalesInvoiceStateDto). */
export function transformInvoiceState(raw: CrunchInvoiceState): Invoice {
  const gross = raw.grossAmount ?? 0
  const outstanding = raw.outstandingBalance ?? 0
  const paid = gross - outstanding

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoiceNumber ?? undefined,
    contactId: raw.customerId !== undefined ? String(raw.customerId) : undefined,
    currency: normalizeCurrency(raw.currency),
    totalAmount: gross !== 0 ? Math.round(gross * 100) : undefined,
    taxAmount: raw.vatAmount !== undefined ? Math.round(raw.vatAmount * 100) : undefined,
    paidAmount: paid > 0 ? Math.round(paid * 100) : undefined,
    balanceAmount: outstanding !== 0 ? Math.round(outstanding * 100) : undefined,
    reference: raw.reference ?? undefined,
    postedAt: raw.issuedDate ? new Date(raw.issuedDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Serialize a canonical Invoice for POST/PUT to Crunch. */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customer: invoice.contactId ? { id: Number(invoice.contactId) } : undefined,
    issuedDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    currency: invoice.currency,
    reference: invoice.reference,
    note: invoice.notes ? { text: invoice.notes } : undefined,
    items: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      quantity: li.unitQuantity,
      rate: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      amount: li.totalAmount != null ? li.totalAmount / 100 : undefined,
    })),
  }
}
