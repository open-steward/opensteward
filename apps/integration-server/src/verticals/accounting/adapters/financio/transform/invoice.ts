import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FinancioInvoiceItem {
  id: string | number
  description: string
  qty: number
  unit_price: number
  amount: number
  tax_amount: number
  account_code: string
  tax_rate: number
  discount_amount: number
  [key: string]: unknown
}

export interface FinancioInvoice {
  id: string | number
  invoice_no: string
  invoice_date: string
  due_date: string
  sub_total: number
  tax_total: number
  grand_total: number
  outstanding: number
  currency_code: string
  customer_id: string | number
  customer_name: string
  status: number
  items: FinancioInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(status: number): InvoiceStatus {
  switch (status) {
    case 1:
      return 'AUTHORIZED'
    case 2:
      return 'PAID'
    case 3:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FinancioInvoiceItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount_amount || undefined,
  }
}

export function transformInvoice(raw: FinancioInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_no || undefined,
    contactId: raw.customer_id ? String(raw.customer_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.grand_total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.outstanding,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
