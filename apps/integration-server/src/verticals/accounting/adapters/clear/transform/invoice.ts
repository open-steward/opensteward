import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ClearLineItem {
  id: string
  description: string
  hsn_code: string
  quantity: number
  unit_price: number
  taxable_value: number
  cgst_rate: number
  cgst_amount: number
  sgst_rate: number
  sgst_amount: number
  igst_rate: number
  igst_amount: number
  cess_amount: number
  total_amount: number
  account_id: string
  [key: string]: unknown
}

export interface ClearInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  total_taxable_value: number
  total_tax_amount: number
  grand_total: number
  balance_amount: number
  currency: string
  buyer_id: string
  buyer_name: string
  place_of_supply: string
  status: string
  line_items: ClearLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'pending':
      return 'AUTHORIZED'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'paid':
      return 'PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: ClearLineItem): Lineitem {
  const taxAmount =
    (item.cgst_amount || 0) +
    (item.sgst_amount || 0) +
    (item.igst_amount || 0) +
    (item.cess_amount || 0)
  return {
    id: item.id,
    accountId: item.account_id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total_amount,
    taxAmount: taxAmount || undefined,
  }
}

export function transformInvoice(raw: ClearInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoice_number,
    contactId: raw.buyer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grand_total,
    taxAmount: raw.total_tax_amount,
    balanceAmount: raw.balance_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
