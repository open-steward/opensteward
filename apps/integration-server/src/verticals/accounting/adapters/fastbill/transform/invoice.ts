import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FastbillInvoiceItem {
  ARTICLE_NUMBER: string
  DESCRIPTION: string
  QUANTITY: number
  UNIT_PRICE: number
  VAT_PERCENT: number
  COMPLETE_NET: number
  COMPLETE_GROSS: number
  [key: string]: unknown
}

export interface FastbillInvoice {
  INVOICE_ID: string
  INVOICE_NUMBER: string
  INVOICE_DATE: string
  DUE_DATE: string
  TOTAL: number
  VAT_AMOUNT: number
  SUBTOTAL: number
  OUTSTANDING_AMOUNT: number
  INVOICE_STATUS: string
  CURRENCY_CODE: string
  CUSTOMER_ID: string
  ITEMS: FastbillInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(raw: FastbillInvoice): InvoiceStatus {
  switch (raw.INVOICE_STATUS) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: FastbillInvoiceItem): Lineitem {
  return {
    itemId: item.ARTICLE_NUMBER || undefined,
    itemDescription: item.DESCRIPTION || undefined,
    unitAmount: item.UNIT_PRICE,
    unitQuantity: item.QUANTITY,
    totalAmount: item.COMPLETE_GROSS,
    taxAmount: item.VAT_PERCENT || undefined,
  }
}

export function transformInvoice(raw: FastbillInvoice): Invoice {
  return {
    id: String(raw.INVOICE_ID),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.INVOICE_NUMBER || undefined,
    contactId: raw.CUSTOMER_ID ? String(raw.CUSTOMER_ID) : undefined,
    currency: raw.CURRENCY_CODE || undefined,
    totalAmount: raw.TOTAL,
    taxAmount: raw.VAT_AMOUNT,
    balanceAmount: raw.OUTSTANDING_AMOUNT,
    lineItems: (raw.ITEMS ?? []).map(mapLineitem),
    postedAt: raw.INVOICE_DATE ? new Date(raw.INVOICE_DATE) : undefined,
    dueAt: raw.DUE_DATE ? new Date(raw.DUE_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export type FastBillInvoice = FastbillInvoice
