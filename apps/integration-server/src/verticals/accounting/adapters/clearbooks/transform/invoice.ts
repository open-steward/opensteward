import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ClearBooksInvoiceLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_net: number
  tax_amount: number
  account_code: string
  [key: string]: unknown
}

export interface ClearBooksInvoice {
  invoice_id: string | number
  invoice_number: string
  entity_id: string | number
  date_created: string
  date_due: string
  total_gross: number
  total_net: number
  total_tax: number
  currency: string
  status: string
  line_items: ClearBooksInvoiceLineItem[]
  [key: string]: unknown
}

// UK date format: DD/MM/YYYY
function parseUkDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined
  // Handle both DD/MM/YYYY and ISO formats
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/')
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  }
  return new Date(dateStr)
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'unpaid':
      return 'AUTHORIZED'
    case 'draft':
      return 'DRAFT'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ClearBooksInvoiceLineItem): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_code || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_net,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformInvoice(raw: ClearBooksInvoice): Invoice {
  return {
    id: String(raw.invoice_id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.entity_id ? String(raw.entity_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_gross,
    taxAmount: raw.total_tax,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: parseUkDate(raw.date_created as string),
    dueAt: parseUkDate(raw.date_due as string),
    metadata: raw as Record<string, unknown>,
  }
}
