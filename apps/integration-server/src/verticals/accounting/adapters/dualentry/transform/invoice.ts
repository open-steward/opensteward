import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal, toMinorUnits, toCalendarDate } from '../../shared/transform'

export interface DualentryInvoiceItem {
  id: number
  position: number
  item_id: number | null
  memo: string | null
  rate: string
  quantity: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  amount: string
  [key: string]: unknown
}

export interface DualentryInvoice {
  id: number
  internal_id: number
  number: number
  company_id: number | null
  company_name: string | null
  company_currency: string | null
  customer_id: number | null
  customer_name: string | null
  currency_iso_4217_code: string | null
  exchange_rate: string | null
  amount: string
  amount_due: string
  paid_total: string
  date: string | null
  transaction_date: string | null
  due_date: string | null
  memo: string | null
  reference_number: string | null
  record_status: 'draft' | 'posted' | 'archived' | string
  approval_status: string | null
  items: DualentryInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(raw: DualentryInvoice): InvoiceStatus {
  if (raw.record_status === 'archived') return 'VOIDED'
  const amountDue = parseDecimal(raw.amount_due) ?? 0
  const paidTotal = parseDecimal(raw.paid_total) ?? 0
  if (raw.record_status === 'posted') {
    if (paidTotal > 0 && amountDue === 0) return 'PAID'
    if (paidTotal > 0 && amountDue > 0) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapLineitem(item: DualentryInvoiceItem): Lineitem {
  return {
    id: String(item.id),
    itemId: item.item_id != null ? String(item.item_id) : undefined,
    itemDescription: item.memo || undefined,
    unitAmount: toMinorUnits(item.rate),
    unitQuantity: parseDecimal(item.quantity) != null ? Math.round(parseDecimal(item.quantity)!) : undefined,
    totalAmount: toMinorUnits(item.gross_amount),
    taxAmount: toMinorUnits(item.tax_amount),
  }
}

export function transformInvoice(raw: DualentryInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number != null ? String(raw.number) : undefined,
    // contactId uses the compound prefix required by getContact()
    contactId: raw.customer_id != null ? `cust_${raw.customer_id}` : undefined,
    currency: raw.currency_iso_4217_code || undefined,
    totalAmount: toMinorUnits(raw.amount),
    taxAmount: undefined,
    balanceAmount: toMinorUnits(raw.amount_due),
    paidAmount: toMinorUnits(raw.paid_total) || undefined,
    notes: raw.memo || undefined,
    reference: raw.reference_number || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  // contactId is stored as 'cust_<n>' — strip the prefix before sending to the API
  const rawCustomerId =
    invoice.contactId != null
      ? Number(invoice.contactId.startsWith('cust_') ? invoice.contactId.slice(5) : invoice.contactId)
      : undefined
  return {
    customer_id: rawCustomerId,
    currency_iso_4217_code: invoice.currency,
    date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    memo: invoice.notes,
    reference_number: invoice.reference,
    record_status: invoice.status === 'DRAFT' ? 'draft' : 'posted',
    items: invoice.lineItems?.map((li) => ({
      item_id: li.itemId != null ? Number(li.itemId) : undefined,
      memo: li.itemDescription,
      // convert minor-unit amounts back to decimal for the API
      rate: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      quantity: li.unitQuantity,
    })),
  }
}
