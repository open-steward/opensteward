import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface TwinfieldInvoiceLine {
  id: string
  article: string
  description: string
  quantity: number
  unitsPriceExcl: number
  valueExcl: number
  valueInc: number
  vatCode: string
  vatValue: number
  dim1: string
  [key: string]: unknown
}

export interface TwinfieldInvoice {
  code: string
  invoiceNumber: string
  customer: string
  currency: string
  invoiceDate: string
  dueDate: string
  status: string
  totalExcl: number
  totalIncl: number
  vatTotal: number
  paidAmount: number
  balance: number
  headerText: string
  lines: TwinfieldInvoiceLine[]
  office: string
  [key: string]: unknown
}

function mapStatus(inv: TwinfieldInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase() ?? ''
  if (s === 'final' && inv.balance === 0) return 'PAID'
  if (s === 'final' && inv.paidAmount > 0) return 'PARTIALLY_PAID'
  if (s === 'final') return 'AUTHORIZED'
  if (s === 'concept') return 'DRAFT'
  if (s === 'voided' || s === 'deleted') return 'VOIDED'
  return 'DRAFT'
}

function mapLineitem(row: TwinfieldInvoiceLine): Lineitem {
  return {
    id: row.id,
    accountId: row.dim1 || undefined,
    itemId: row.article || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitsPriceExcl,
    unitQuantity: row.quantity,
    totalAmount: row.valueInc,
    taxAmount: row.vatValue || undefined,
    taxrateId: row.vatCode || undefined,
  }
}

export function transformInvoice(raw: TwinfieldInvoice): Invoice {
  return {
    id: raw.code,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customer || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalIncl,
    taxAmount: raw.vatTotal,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
