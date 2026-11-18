import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BillyInvoiceLine {
  id: string
  productId: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  taxRateId: string
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface BillyInvoice {
  id: string
  invoiceNo: number
  contactId: string
  currencyId: string
  entryDate: string
  dueDate: string
  state: string
  grossAmount: number
  taxAmount: number
  balance: number
  paidAmount: number
  sentState: string
  invoiceLines: BillyInvoiceLine[]
  organizationId: string
  [key: string]: unknown
}

function mapStatus(inv: BillyInvoice): InvoiceStatus {
  if (inv.state === 'voided') return 'VOIDED'
  if (inv.state === 'approved' && inv.balance === 0) return 'PAID'
  if (inv.state === 'approved' && inv.paidAmount > 0) return 'PARTIALLY_PAID'
  if (inv.state === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: BillyInvoiceLine): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.taxAmount || undefined,
    taxrateId: row.taxRateId || undefined,
  }
}

export function transformInvoice(raw: BillyInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNo ? String(raw.invoiceNo) : undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currencyId || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    lineItems: (raw.invoiceLines ?? []).map(mapLineitem),
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
