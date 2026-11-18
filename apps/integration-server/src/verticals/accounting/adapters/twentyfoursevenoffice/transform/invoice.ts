import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface TwentyFourSevenInvoiceLine {
  id: string
  productId: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  taxCode: string
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface TwentyFourSevenInvoice {
  id: string
  invoiceNumber: number
  customerId: string
  currency: string
  invoiceDate: string
  dueDate: string
  status: string
  totalAmount: number
  taxAmount: number
  balance: number
  paidAmount: number
  lines: TwentyFourSevenInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(inv: TwentyFourSevenInvoice): InvoiceStatus {
  if (inv.status === 'voided' || inv.status === 'cancelled') return 'VOIDED'
  if (inv.status === 'paid' || (inv.status === 'approved' && inv.balance === 0)) return 'PAID'
  if (inv.status === 'approved' && inv.paidAmount > 0) return 'PARTIALLY_PAID'
  if (inv.status === 'approved' || inv.status === 'sent') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: TwentyFourSevenInvoiceLine): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.taxAmount || undefined,
    taxrateId: row.taxCode || undefined,
  }
}

export function transformInvoice(raw: TwentyFourSevenInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber ? String(raw.invoiceNumber) : undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
