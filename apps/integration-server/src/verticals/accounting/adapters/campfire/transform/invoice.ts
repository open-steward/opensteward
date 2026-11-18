import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

export interface CampfireInvoiceLine {
  id?: number | null
  description?: string | null
  quantity?: number | null
  rate?: number | null
  amount?: number | null
  tax?: number | null
  product?: number | null
  product_name?: string | null
  currency?: string | null
  [key: string]: unknown
}

export interface CampfireInvoice {
  id: number
  invoice_number?: string | null
  invoice_date?: string | null
  due_date?: string | null
  paid_date?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  client?: number | null
  client_name?: string | null
  entity?: number | null
  currency?: string | null
  total_amount?: number | null
  amount_paid?: number | null
  amount_due?: number | null
  status?: string | null
  payment_status?: string | null
  purchase_order_number?: string | null
  message_on_invoice?: string | null
  lines?: CampfireInvoiceLine[]
  [key: string]: unknown
}

// Campfire invoice status values: draft, open, sent, partial, paid, uncollectible, voided
function mapStatus(raw: CampfireInvoice): InvoiceStatus {
  const s = (raw.payment_status ?? raw.status ?? '').toLowerCase()
  if (s === 'voided' || s === 'uncollectible') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partial' || s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'open') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(line: CampfireInvoiceLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    itemId: line.product != null ? String(line.product) : undefined,
    itemDescription: line.description || undefined,
    itemName: line.product_name || undefined,
    // Campfire amounts are decimal dollars; canonical is integer minor units
    unitAmount: toMinorUnits(line.rate),
    unitQuantity: line.quantity != null ? Math.round(line.quantity) : undefined,
    totalAmount: toMinorUnits(line.amount),
    taxAmount: toMinorUnits(line.tax),
  }
}

export function transformInvoice(raw: CampfireInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.client != null ? String(raw.client) : undefined,
    currency: raw.currency || undefined,
    // Campfire amounts are decimal dollars; canonical is integer minor units
    totalAmount: toMinorUnits(raw.total_amount),
    paidAmount: toMinorUnits(raw.amount_paid),
    balanceAmount: toMinorUnits(raw.amount_due),
    reference: raw.purchase_order_number || undefined,
    notes: raw.message_on_invoice || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    paidAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Invoice → Campfire Invoice body (for create/update)
// Canonical amounts are integer minor units; Campfire expects decimal dollars → divide by 100.
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    client: invoice.contactId ? Number(invoice.contactId) : undefined,
    currency: invoice.currency,
    invoice_date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    invoice_number: invoice.invoiceNumber,
    purchase_order_number: invoice.reference,
    message_on_invoice: invoice.notes,
    lines: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      quantity: li.unitQuantity,
      rate: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      amount: li.totalAmount != null ? li.totalAmount / 100 : undefined,
      tax: li.taxAmount != null ? li.taxAmount / 100 : undefined,
      product: li.itemId ? Number(li.itemId) : undefined,
    })),
  }
}
