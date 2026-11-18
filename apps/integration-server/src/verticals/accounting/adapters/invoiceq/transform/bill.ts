import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface InvoiceqPurchaseInvoiceLineItem {
  item_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat_amount?: number
  [key: string]: unknown
}

export interface InvoiceqPurchaseInvoice {
  id: string
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  sub_total?: number
  vat_amount?: number
  total_amount?: number
  remaining_amount?: number
  status?: string
  supplier_id?: string
  currency_code?: string
  line_items?: InvoiceqPurchaseInvoiceLineItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Active':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: InvoiceqPurchaseInvoiceLineItem): Lineitem {
  return {
    itemId: item.item_id ? String(item.item_id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.vat_amount,
  }
}

export function transformBill(raw: InvoiceqPurchaseInvoice): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.vat_amount,
    balanceAmount: raw.remaining_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
