import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

// AccountsPortal sales invoice wire shape
export interface APInvoiceLine {
  id: number
  account_id: number
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate_id: number | null
  tax_amount: number
  total_amount: number
  [key: string]: unknown
}

export interface APInvoice {
  id: number
  invoice_number: string
  contact_id: number
  currency: string
  issue_date: string
  due_date: string
  status: string            // 'draft' | 'sent' | 'paid' | 'part_paid' | 'void'
  net_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  balance: number
  reference: string | null
  notes: string | null
  invoice_lines: APInvoiceLine[]
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function mapStatus(raw: APInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'part_paid') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'sent' || s === 'authorized' || s === 'approved') return 'AUTHORIZED'
  if (s === 'draft') return 'DRAFT'
  // Derive from balance when status string is unrecognised
  if (raw.balance === 0 && raw.total_amount > 0) return 'PAID'
  if (raw.balance > 0 && raw.balance < raw.total_amount) return 'PARTIALLY_PAID'
  if (raw.due_date && new Date(raw.due_date).getTime() < Date.now() && raw.balance > 0) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLine(row: APInvoiceLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: toMinorUnits(row.unit_price),
    unitQuantity: row.quantity,
    taxAmount: toMinorUnits(row.tax_amount) || undefined,
    taxrateId: row.tax_rate_id ? String(row.tax_rate_id) : undefined,
    totalAmount: toMinorUnits(row.total_amount),
  }
}

export function transformInvoice(raw: APInvoice): Invoice {
  // Invoices are always issued to customers; prefix 'c_' mirrors transformContact's id scheme.
  const contactId = raw.contact_id != null ? `c_${raw.contact_id}` : undefined
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.total_amount),
    taxAmount: toMinorUnits(raw.tax_amount) || undefined,
    paidAmount: toMinorUnits(raw.paid_amount) || undefined,
    balanceAmount: toMinorUnits(raw.balance),
    reference: raw.reference || undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.invoice_lines ?? []).map(mapLine),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  // Strip the 'c_' prefix that transformContact/transformInvoice add, to recover the raw numeric id.
  const rawContactId = invoice.contactId
    ? Number(invoice.contactId.startsWith('c_') ? invoice.contactId.slice(2) : invoice.contactId)
    : undefined
  return {
    contact_id: rawContactId || undefined,
    currency: invoice.currency,
    invoice_number: invoice.invoiceNumber,
    issue_date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    reference: invoice.reference,
    notes: invoice.notes,
    invoice_lines: invoice.lineItems?.map((li) => ({
      account_id: li.accountId ? Number(li.accountId) : undefined,
      description: li.itemDescription,
      quantity: li.unitQuantity,
      // Canonical amounts are minor units; convert back to decimal for the API.
      unit_price: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      tax_rate_id: li.taxrateId ? Number(li.taxrateId) : undefined,
    })),
  }
}
