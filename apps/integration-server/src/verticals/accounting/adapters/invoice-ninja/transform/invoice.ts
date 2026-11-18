import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { currencyIdToIso } from '../constants'

// Invoice Ninja v5 invoice status IDs
// 1=Draft, 2=Sent/Authorized, 3=Partial, 4=Paid, 5=Cancelled/Voided, 6=Reversed
const STATUS_MAP: Record<number, InvoiceStatus> = {
  1: 'DRAFT',
  2: 'AUTHORIZED',
  3: 'PARTIALLY_PAID',
  4: 'PAID',
  5: 'VOIDED',
  6: 'VOIDED',
}

export interface InvoiceNinjaLineItem {
  product_key?: string | null
  notes?: string | null
  cost?: number | null
  quantity?: number | null
  tax_rate1?: number | null
  discount?: number | null
  line_total?: number | null
  [key: string]: unknown
}

export interface InvoiceNinjaInvoice {
  id: string
  status_id: number
  number?: string | null
  client_id?: string | null
  amount?: number | null
  balance?: number | null
  paid_to_date?: number | null
  tax_amount?: number | null
  discount?: number | null
  currency_id?: string | null
  date?: string | null
  due_date?: string | null
  po_number?: string | null
  public_notes?: string | null
  line_items?: InvoiceNinjaLineItem[] | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

function mapStatus(statusId: number): InvoiceStatus {
  return STATUS_MAP[statusId] ?? 'DRAFT'
}

function parseDateStr(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function parseEpoch(n?: number | null): Date | undefined {
  if (!n) return undefined
  return new Date(n * 1000)
}

function mapLineItem(li: InvoiceNinjaLineItem): Lineitem {
  return {
    itemId: li.product_key || undefined,
    itemDescription: li.notes || undefined,
    unitAmount: li.cost ?? undefined,
    unitQuantity: li.quantity != null ? Math.round(li.quantity) : undefined,
    discountAmount: li.discount || undefined,
    totalAmount: li.line_total ?? undefined,
  }
}

export function transformInvoice(raw: InvoiceNinjaInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status_id),
    invoiceNumber: raw.number || undefined,
    contactId: raw.client_id || undefined,
    currency: currencyIdToIso(raw.currency_id),
    totalAmount: raw.amount ?? undefined,
    taxAmount: raw.tax_amount || undefined,
    discountAmount: raw.discount || undefined,
    paidAmount: raw.paid_to_date || undefined,
    balanceAmount: raw.balance ?? undefined,
    reference: raw.po_number || undefined,
    notes: raw.public_notes || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: parseDateStr(raw.date),
    dueAt: parseDateStr(raw.due_date),
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Invoice → Invoice Ninja body (for create/update) */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    client_id: invoice.contactId,
    date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    po_number: invoice.reference,
    public_notes: invoice.notes,
    line_items: invoice.lineItems?.map((li) => ({
      product_key: li.itemId,
      notes: li.itemDescription,
      cost: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
