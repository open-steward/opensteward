import { toCalendarDate } from '../../shared/transform'
/**
 * Reckon One v2 invoice transforms.
 *
 * API endpoint: GET/POST/PUT /R1/{cashbookId}/invoices[/{invoiceId}]
 *
 * Key fields (Reckon One API v2):
 *   id, invoiceNumber, customer.id, date, dueDate, totalAmount, amountOwing,
 *   currency, lines[].id, lines[].accountId, lines[].description,
 *   lines[].unitPrice, lines[].quantity, lines[].amount, status
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonOneInvoiceLine {
  id?: string
  lineNumber?: number
  description?: string
  accountId?: string
  itemId?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  taxCodeId?: string
  taxAmount?: number
  [key: string]: unknown
}

export interface ReckonOneInvoice {
  id: string
  invoiceNumber?: string
  customer?: { id: string; name?: string }
  /** ISO date string, e.g. "2024-03-01" */
  date?: string
  dueDate?: string
  /** Total including tax */
  totalAmount?: number
  /** Amount still owing */
  amountOwing?: number
  currency?: string
  status?: string
  notes?: string
  lines?: ReckonOneInvoiceLine[]
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

function mapStatus(raw: ReckonOneInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'PAID' || raw.amountOwing === 0) return 'PAID'
  if (s === 'DRAFT') return 'DRAFT'
  if (s === 'VOID' || s === 'VOIDED') return 'VOIDED'
  if (s === 'DELETED') return 'DELETED'

  const owing = raw.amountOwing ?? 0
  const total = raw.totalAmount ?? 0
  if (owing > 0 && owing < total) return 'PARTIALLY_PAID'
  if (raw.dueDate && new Date(raw.dueDate).getTime() < Date.now() && owing > 0) return 'OVERDUE'
  return 'AUTHORIZED'
}

function toMinorUnits(value: number | undefined | null): number | undefined {
  return value != null ? Math.round(value * 100) : undefined
}

function mapLines(lines: ReckonOneInvoiceLine[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    accountId: l.accountId || undefined,
    itemId: l.itemId || undefined,
    itemDescription: l.description || undefined,
    unitAmount: toMinorUnits(l.unitPrice),
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: toMinorUnits(l.amount),
    taxAmount: toMinorUnits(l.taxAmount),
  }))
}

export function transformInvoice(raw: ReckonOneInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customer?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.totalAmount),
    balanceAmount: toMinorUnits(raw.amountOwing),
    paidAmount:
      raw.totalAmount != null && raw.amountOwing != null
        ? Math.round((raw.totalAmount - raw.amountOwing) * 100)
        : undefined,
    notes: raw.notes || undefined,
    lineItems: mapLines(raw.lines ?? []),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    invoiceNumber: invoice.invoiceNumber,
    customer: invoice.contactId ? { id: invoice.contactId } : undefined,
    currency: invoice.currency,
    date: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    notes: invoice.notes,
    lines: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      accountId: li.accountId,
      itemId: li.itemId,
      unitPrice: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      quantity: li.unitQuantity,
      amount: li.totalAmount != null ? li.totalAmount / 100 : undefined,
    })),
  }
}
