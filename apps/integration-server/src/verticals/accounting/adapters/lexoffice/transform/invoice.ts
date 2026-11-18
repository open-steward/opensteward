import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface LexofficeLineItem {
  type: string
  name: string
  description: string
  quantity: number
  unitName: string
  unitPrice: { currency: string; netAmount: number; grossAmount: number; taxRatePercentage: number }
  discountPercentage: number
  lineItemAmount: number
}

export interface LexofficeInvoice {
  id: string
  organizationId: string
  createdDate: string
  updatedDate: string
  voucherDate: string
  dueDate: string | null
  address: {
    contactId?: string
    name: string
    street: string
    city: string
    zip: string
    countryCode: string
  }
  lineItems: LexofficeLineItem[]
  totalPrice: {
    currency: string
    totalNetAmount: number
    totalGrossAmount: number
    totalTaxAmount: number
    totalDiscountAbsolute: number | null
  }
  taxConditions: { taxType: string }
  voucherStatus: 'draft' | 'open' | 'paid' | 'paidoff' | 'voided' | 'transferred' | 'sepadebit'
  voucherNumber: string
  [key: string]: unknown
}

function mapStatus(raw: LexofficeInvoice): InvoiceStatus {
  switch (raw.voucherStatus) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid':
    case 'paidoff':
    case 'sepadebit': return 'PAID'
    case 'voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: LexofficeInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.voucherNumber || undefined,
    contactId: raw.address?.contactId || undefined,
    currency: raw.totalPrice?.currency || undefined,
    totalAmount: raw.totalPrice?.totalGrossAmount,
    taxAmount: raw.totalPrice?.totalTaxAmount,
    discountAmount: raw.totalPrice?.totalDiscountAbsolute ?? undefined,
    lineItems: (raw.lineItems ?? []).map((li, i) => ({
      id: String(i),
      itemDescription: li.name || li.description || undefined,
      unitAmount: li.unitPrice?.netAmount,
      unitQuantity: li.quantity,
      totalAmount: li.lineItemAmount,
    })),
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdDate ? new Date(raw.createdDate) : undefined,
    updatedAt: raw.updatedDate ? new Date(raw.updatedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
