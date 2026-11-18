import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// Melio invoice (AR) — a receivable sent to a customer
export interface MelioInvoiceLineItem {
  id?: string
  description?: string
  amount: number
  quantity?: number
  unitPrice?: number
  [key: string]: unknown
}

export interface MelioInvoice {
  id: string
  invoiceNumber?: string
  customerId?: string
  amount: number
  balance?: number
  currency?: string
  status?: string
  invoiceDate?: string
  dueDate?: string
  paidAt?: string
  lineItems?: MelioInvoiceLineItem[]
  notes?: string
  invoiceUrl?: string
  send?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(raw: MelioInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'PAID') return 'PAID'
  if (s === 'PARTIALLY_PAID') return 'PARTIALLY_PAID'
  if (s === 'DRAFT') return 'DRAFT'
  if (s === 'VOIDED' || s === 'CANCELLED') return 'VOIDED'
  const balance = raw.balance ?? raw.amount
  if (balance === 0) return 'PAID'
  if (balance < raw.amount) return 'PARTIALLY_PAID'
  if (raw.dueDate && new Date(raw.dueDate).getTime() < Date.now()) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLines(lines: MelioInvoiceLineItem[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    itemDescription: l.description || undefined,
    unitAmount: l.unitPrice ?? undefined,
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: l.amount,
  }))
}

export function transformInvoice(raw: MelioInvoice): Invoice {
  const total = raw.amount
  const balance = raw.balance ?? raw.amount
  const paid = total - balance

  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: (raw.currency as Invoice['currency']) || undefined,
    totalAmount: total,
    balanceAmount: balance,
    paidAmount: paid > 0 ? paid : undefined,
    notes: raw.notes || undefined,
    url: raw.invoiceUrl || undefined,
    send: raw.send ?? undefined,
    lineItems: raw.lineItems ? mapLines(raw.lineItems) : undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    paidAt: raw.paidAt ? new Date(raw.paidAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.contactId,
    currency: invoice.currency,
    amount: invoice.totalAmount,
    invoiceDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    notes: invoice.notes,
    send: invoice.send,
    lineItems: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      amount: li.totalAmount,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
