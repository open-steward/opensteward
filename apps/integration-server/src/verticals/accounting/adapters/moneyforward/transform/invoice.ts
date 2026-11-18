import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MoneyForwardBillingItem {
  id: string
  name: string
  quantity: number
  unit_price: number
  price: number
  excise: number
  excise_type: string
  detail: string | null
  [key: string]: unknown
}

export interface MoneyForwardBilling {
  id: string
  title: string | null
  billing_number: string | null
  billing_date: string
  due_date: string
  price_before_tax: number
  price: number
  tax: number
  outstanding_amount: number
  payment_status: string
  excise_type: string
  partner_id: string | null
  partner_name: string | null
  items: MoneyForwardBillingItem[]
  [key: string]: unknown
}

function mapStatus(payment_status: string): InvoiceStatus {
  if (payment_status === 'settled') return 'PAID'
  if (payment_status === 'unsettled') return 'AUTHORIZED'
  if (payment_status === 'unconfirmed') return 'DRAFT'
  if (payment_status === 'pending') return 'DRAFT'
  return 'DRAFT'
}

function mapLineitem(item: MoneyForwardBillingItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.name || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.price,
    taxAmount: item.excise || undefined,
  }
}

export function transformInvoice(raw: MoneyForwardBilling): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.payment_status as string),
    invoiceNumber: raw.billing_number || undefined,
    contactId: raw.partner_id ? String(raw.partner_id) : undefined,
    totalAmount: raw.price,
    taxAmount: raw.tax,
    balanceAmount: raw.outstanding_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.billing_date ? new Date(raw.billing_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
