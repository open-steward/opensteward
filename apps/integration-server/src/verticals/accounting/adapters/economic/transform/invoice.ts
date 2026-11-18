import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface EconomicInvoiceLine {
  lineNumber: number
  description: string
  product: { productNumber: string; name: string } | null
  quantity: number
  unitNetPrice: number
  totalNetAmount: number
  totalGrossAmount: number
  vatAmount: number
  vatRate: number
  unit: { unitNumber: number; name: string } | null
  [key: string]: unknown
}

export interface EconomicInvoice {
  bookedInvoiceNumber: number
  draftInvoiceNumber: number
  date: string
  dueDate: string
  currency: string
  netAmount: number
  grossAmount: number
  vatAmount: number
  remainder: number
  roundingAmount: number
  customer: { customerNumber: number; name: string } | null
  lines: EconomicInvoiceLine[]
  paymentTerms: { name: string } | null
  notes: { heading: string; textLine1: string } | null
  references: { other: string } | null
  [key: string]: unknown
}

function mapStatus(inv: EconomicInvoice): InvoiceStatus {
  if (inv.remainder === 0 && inv.bookedInvoiceNumber) return 'PAID'
  if (inv.remainder > 0 && inv.remainder < inv.grossAmount) return 'PARTIALLY_PAID'
  if (inv.bookedInvoiceNumber) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: EconomicInvoiceLine): Lineitem {
  return {
    id: String(row.lineNumber),
    itemId: row.product?.productNumber || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitNetPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalGrossAmount,
    taxAmount: row.vatAmount || undefined,
  }
}

export function transformInvoice(raw: EconomicInvoice): Invoice {
  const invoiceNumber = raw.bookedInvoiceNumber || raw.draftInvoiceNumber
  return {
    id: String(invoiceNumber),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: invoiceNumber ? String(invoiceNumber) : undefined,
    contactId: raw.customer?.customerNumber ? String(raw.customer.customerNumber) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainder,
    reference: raw.references?.other || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
