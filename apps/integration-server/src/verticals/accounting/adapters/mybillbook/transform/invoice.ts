/**
 * myBillBook → canonical Invoice transform.
 *
 * myBillBook invoice fields (snake_case on the wire):
 *   id, invoice_number, party_id, party_name, invoice_date, due_date,
 *   status ("draft"|"sent"|"paid"|"partially_paid"|"cancelled"|"overdue"),
 *   currency, total_amount, tax_amount, discount_amount, paid_amount,
 *   balance_amount, reference_number, notes, items[], created_at, updated_at
 *
 * items[]:
 *   id, item_name, description, unit_price, quantity, discount, tax_amount, total_amount
 *
 * Amounts: myBillBook returns decimal INR (e.g. 1250.00).
 * Canonical amounts are INTEGER MINOR UNITS (paise): multiply by 100 + Math.round.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

export interface MybillbookInvoiceItem {
  id?: string
  item_name?: string
  description?: string
  unit_price?: number
  quantity?: number
  discount?: number
  tax_amount?: number
  total_amount?: number
  [key: string]: unknown
}

export interface MybillbookInvoice {
  id: string
  invoice_number?: string
  party_id?: string
  party_name?: string
  invoice_date?: string
  due_date?: string
  status?: string
  currency?: string
  total_amount?: number
  tax_amount?: number
  discount_amount?: number
  paid_amount?: number
  balance_amount?: number
  reference_number?: string
  notes?: string
  items?: MybillbookInvoiceItem[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: MybillbookInvoice): InvoiceStatus {
  const s = typeof raw.status === 'string' ? raw.status.toLowerCase() : ''
  if (s === 'draft') return 'DRAFT'
  if (s === 'sent' || s === 'submitted') return 'SUBMITTED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  return 'DRAFT'
}

function mapLineitem(item: MybillbookInvoiceItem): Lineitem {
  return {
    id: item.id || undefined,
    itemName: item.item_name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: toMinorUnits(item.unit_price),
    unitQuantity: item.quantity !== undefined ? Math.round(item.quantity) : undefined,
    discountAmount: toMinorUnits(item.discount),
    taxAmount: toMinorUnits(item.tax_amount),
    totalAmount: toMinorUnits(item.total_amount),
  }
}

export function transformInvoice(raw: MybillbookInvoice): Invoice {
  const isoInvoiceDate = toIsoDatetime(raw.invoice_date)
  const isoDueDate = toIsoDatetime(raw.due_date)
  const isoCreatedAt = toIsoDatetime(raw.created_at)
  const isoUpdatedAt = toIsoDatetime(raw.updated_at)

  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.party_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.total_amount),
    taxAmount: toMinorUnits(raw.tax_amount),
    discountAmount: toMinorUnits(raw.discount_amount),
    paidAmount: toMinorUnits(raw.paid_amount),
    balanceAmount: toMinorUnits(raw.balance_amount),
    reference: raw.reference_number || undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: isoInvoiceDate ? new Date(isoInvoiceDate) : undefined,
    dueAt: isoDueDate ? new Date(isoDueDate) : undefined,
    createdAt: isoCreatedAt ? new Date(isoCreatedAt) : undefined,
    updatedAt: isoUpdatedAt ? new Date(isoUpdatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Invoice → myBillBook invoice body (for create/update).
 *
 * Canonical amounts are minor units (paise); myBillBook expects decimal INR.
 * Divide by 100 before sending.
 */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    party_id: invoice.contactId,
    currency: invoice.currency,
    invoice_date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    reference_number: invoice.reference,
    notes: invoice.notes,
    items: invoice.lineItems?.map((li) => ({
      item_name: li.itemName,
      description: li.itemDescription,
      unit_price: li.unitAmount !== undefined && li.unitAmount !== null
        ? li.unitAmount / 100
        : undefined,
      quantity: li.unitQuantity,
      discount: li.discountAmount !== undefined && li.discountAmount !== null
        ? li.discountAmount / 100
        : undefined,
    })),
  }
}
