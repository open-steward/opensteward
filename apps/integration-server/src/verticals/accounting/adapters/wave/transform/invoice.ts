import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface WaveInvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  account: { id: string } | null
  taxes: { amount: number; salesTax: { id: string; name: string; rate: number } }[]
  [key: string]: unknown
}

export interface WaveInvoice {
  id: string
  invoiceNumber: string
  customer: { id: string } | null
  currency: { code: string } | null
  totalAmount: number
  taxAmount: number
  amountDue: number
  amountPaid: number
  items: WaveInvoiceItem[]
  invoiceDate: string
  dueDate: string
  status: string
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

function mapStatus(status: string, inv: WaveInvoice): InvoiceStatus {
  const s = status.toUpperCase()
  if (s === 'PAID') return 'PAID'
  if (s === 'PARTIAL') return 'PARTIALLY_PAID'
  if (s === 'OVERDUE') return 'OVERDUE'
  if (s === 'VIEWED' || s === 'SENT' || s === 'UNPAID') return 'SUBMITTED'
  if (s === 'DRAFT') return 'DRAFT'
  if (inv.amountPaid > 0 && inv.amountPaid < inv.totalAmount) return 'PARTIALLY_PAID'
  return 'DRAFT'
}

function mapLineitem(row: WaveInvoiceItem): Lineitem {
  const taxAmount = row.taxes?.reduce((sum, t) => sum + (t.amount ?? 0), 0) || undefined
  return {
    id: row.id,
    accountId: row.account?.id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount,
  }
}

export function transformInvoice(raw: WaveInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status, raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customer?.id || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    paidAmount: raw.amountPaid || undefined,
    balanceAmount: raw.amountDue,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
