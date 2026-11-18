import { toEpochSeconds } from '../../shared/transform'
/**
 * Invoiced Invoice transforms.
 *
 * Invoiced statuses: draft, not_sent, sent, viewed, past_due, pending, paid, voided
 * Docs: https://developer.invoiced.com/api/invoices
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface InvoicedLineItem {
  id: number
  object: string
  catalog_item: string | null
  type: string
  name: string | null
  description: string | null
  quantity: number
  unit_cost: number
  amount: number
  taxable: boolean
  discountable: boolean
  metadata: Record<string, unknown>
  [key: string]: unknown
}

export interface InvoicedInvoice {
  id: number
  object: string
  customer: number
  number: string | null
  status: string
  draft: boolean
  closed: boolean
  paid: boolean
  currency: string
  date: number | null
  due_date: number | null
  payment_terms: string | null
  items: InvoicedLineItem[]
  subtotal: number
  discounts: unknown[]
  taxes: unknown[]
  total: number
  balance: number
  url: string | null
  payment_url: string | null
  pdf_url: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  [key: string]: unknown
}

function mapStatus(raw: InvoicedInvoice): InvoiceStatus {
  const s = raw.status
  if (s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'past_due') return 'OVERDUE'
  if (s === 'pending') return 'PARTIALLY_PAID'
  if (s === 'draft') return 'DRAFT'
  // sent / viewed / not_sent — invoice has been authorized/issued
  return 'AUTHORIZED'
}

function mapLineitem(li: InvoicedLineItem): Lineitem {
  return {
    id: String(li.id),
    itemId: li.catalog_item || undefined,
    itemName: li.name || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_cost,
    unitQuantity: li.quantity,
    totalAmount: li.amount,
  }
}

export function transformInvoice(raw: InvoicedInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || String(raw.id),
    contactId: raw.customer ? String(raw.customer) : undefined,
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    totalAmount: raw.total,
    balanceAmount: raw.balance,
    notes: raw.notes || undefined,
    url: raw.url || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date * 1000) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at * 1000) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Invoice → Invoiced body (for create/update) */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customer: invoice.contactId ? Number(invoice.contactId) : undefined,
    currency: invoice.currency?.toLowerCase(),
    date: invoice.postedAt ? toEpochSeconds(invoice.postedAt) : undefined,
    due_date: invoice.dueAt ? toEpochSeconds(invoice.dueAt) : undefined,
    notes: invoice.notes,
    items: invoice.lineItems?.map((li) => ({
      catalog_item: li.itemId,
      name: li.itemName,
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unit_cost: li.unitAmount,
    })),
  }
}
