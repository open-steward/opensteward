import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FattureCloudItem {
  id: number
  product_id: number
  name: string
  qty: number
  cost: number
  net_price: number
  vat: { value: number }
}

export interface FattureCloudInvoice {
  id: number
  type: string
  number: string
  numeration: string
  client_id: number
  date: string
  currency: { id: string; symbol: string }
  amount_net: number
  amount_gross: number
  amount_vat: number
  payment_status: 'not_paid' | 'partial' | 'paid'
  status: 'rec' | 'draft' | 'proforma' | 'void'
  items_list?: FattureCloudItem[]
  [key: string]: unknown
}

function mapStatus(raw: FattureCloudInvoice): InvoiceStatus {
  if (raw.status === 'draft') return 'DRAFT'
  if (raw.status === 'void') return 'VOIDED'
  if (raw.payment_status === 'paid') return 'PAID'
  if (raw.payment_status === 'partial') return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLineitem(item: FattureCloudItem): Lineitem {
  return {
    id: String(item.id),
    itemId: item.product_id ? String(item.product_id) : undefined,
    itemDescription: item.name || undefined,
    unitAmount: item.cost,
    unitQuantity: item.qty,
    totalAmount: item.net_price,
  }
}

export function transformInvoice(raw: FattureCloudInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency?.id || undefined,
    totalAmount: raw.amount_gross,
    taxAmount: raw.amount_vat,
    lineItems: (raw.items_list ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
