import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BrioxInvoiceLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat_amount?: number
  account_number?: string | number
  [key: string]: unknown
}

export interface BrioxInvoice {
  id: number | string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  subtotal?: number
  vat_amount?: number
  total?: number
  remaining?: number
  status?: number | string
  contact_id?: number | string
  currency?: string
  lines?: BrioxInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: number | string): InvoiceStatus {
  const s = typeof status === 'number' ? status : Number(status)
  if (!isNaN(s)) {
    switch (s) {
      case 1: return 'DRAFT'
      case 2: return 'AUTHORIZED'
      case 3: return 'PAID'
      case 4: return 'VOIDED'
    }
  }
  switch (String(status).toLowerCase()) {
    case 'paid': return 'PAID'
    case 'authorized': return 'AUTHORIZED'
    case 'voided':
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: BrioxInvoiceLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account_number != null ? String(line.account_number) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
    taxAmount: line.vat_amount || undefined,
  }
}

export function transformInvoice(raw: BrioxInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
