import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AppFolioInvoiceLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface AppFolioInvoice {
  id: string | number
  invoice_number: string
  tenant_id: string | number
  property_id: string | number
  unit_id: string | number
  lease_id: string | number
  date: string
  due_date: string
  amount: number
  tax_amount: number
  currency: string
  status: string
  line_items: AppFolioInvoiceLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'approved':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'draft':
      return 'DRAFT'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AppFolioInvoiceLineItem): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformInvoice(raw: AppFolioInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.tenant_id ? String(raw.tenant_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.tax_amount || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
