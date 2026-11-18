import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface SevDeskInvoicePosition {
  id: string
  name: string
  quantity: string
  price: string
  sumNet: string
  sumGross: string
  taxRate: string
  [key: string]: unknown
}

export interface SevDeskInvoice {
  id: string
  invoiceNumber: string
  contact: { id: string; objectName: string } | null
  invoiceDate: string
  header: string
  footText: string
  timeToPay: string
  discountTime: string
  discount: string
  payDate: string | null
  status: string
  sumNet: string
  sumGross: string
  sumTax: string
  sumDiscounts: string
  currency: string
  invoiceType: string
  createUser: { id: string }
  [key: string]: unknown
}

function mapStatus(raw: SevDeskInvoice): InvoiceStatus {
  // sevDesk status codes: 100=Draft, 200=Delivered, 1000=Cancelled
  switch (raw.status) {
    case '100': return 'DRAFT'
    case '200': return raw.payDate ? 'PAID' : 'AUTHORIZED'
    case '1000': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: SevDeskInvoice): Invoice {
  return {
    id: raw.id,
    type: raw.invoiceType === 'RE' ? 'CREDITMEMO' : 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.contact?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.sumGross) || undefined,
    taxAmount: parseFloat(raw.sumTax) || undefined,
    discountAmount: parseFloat(raw.sumDiscounts) || undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    paidAt: raw.payDate ? new Date(raw.payDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
