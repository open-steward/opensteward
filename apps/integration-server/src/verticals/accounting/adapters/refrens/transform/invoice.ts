import { toCalendarDate } from '../../shared/transform'
/**
 * Refrens invoice → canonical Invoice.
 *
 * Refrens invoice fields (from GET /businesses/:urlKey/invoices/:id):
 *   _id, invoiceNumber, invoiceDate (ISO 8601), dueDate (ISO 8601),
 *   currency, status ("UNPAID" | "PAID" | "PARTIALLY_PAID" | "CANCELED"),
 *   billedTo.{ name, email, phone, gstin, … },
 *   items[].{ name, rate, quantity, igst, cgst, sgst, taxRate, total },
 *   finalTotal.{ total, igst, cgst, sgst, subTotal },
 *   share.{ link, pdf },
 *   createdAt, updatedAt
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Raw Refrens types ─────────────────────────────────────────────────────────

export interface RefrensInvoiceItem {
  name?: string
  rate?: number
  quantity?: number
  igst?: number
  cgst?: number
  sgst?: number
  taxRate?: number
  total?: number
  [key: string]: unknown
}

export interface RefrensInvoiceFinalTotal {
  total?: number
  igst?: number
  cgst?: number
  sgst?: number
  subTotal?: number
  [key: string]: unknown
}

export interface RefrensInvoiceBilledTo {
  name?: string
  email?: string
  phone?: string
  gstin?: string
  [key: string]: unknown
}

export interface RefrensInvoice {
  _id: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  currency?: string
  status?: string        // "UNPAID" | "PAID" | "PARTIALLY_PAID" | "CANCELED"
  billType?: string      // "INVOICE" | "BOS"
  billedTo?: RefrensInvoiceBilledTo
  items?: RefrensInvoiceItem[]
  finalTotal?: RefrensInvoiceFinalTotal
  share?: { link?: string; pdf?: string }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: RefrensInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
      return 'PAID'
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID'
    case 'CANCELED':
    case 'CANCELLED':
      return 'VOIDED'
    case 'UNPAID':
      return 'AUTHORIZED'
    default:
      return 'DRAFT'
  }
}

// ── Line-item mapping ─────────────────────────────────────────────────────────

function mapLineitem(item: RefrensInvoiceItem, idx: number): Lineitem {
  const taxAmount =
    (item.igst ?? 0) + (item.cgst ?? 0) + (item.sgst ?? 0) || undefined
  return {
    id: String(idx + 1),
    itemDescription: item.name || undefined,
    unitAmount: item.rate ?? undefined,
    unitQuantity: item.quantity ?? undefined,
    taxAmount: taxAmount ?? undefined,
    totalAmount: item.total ?? undefined,
  }
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformInvoice(raw: RefrensInvoice): Invoice {
  const ft = raw.finalTotal ?? {}
  const taxAmount =
    (ft.igst ?? 0) + (ft.cgst ?? 0) + (ft.sgst ?? 0) || undefined

  return {
    id: raw._id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    currency: raw.currency || undefined,
    totalAmount: ft.total ?? undefined,
    taxAmount: taxAmount ?? undefined,
    url: raw.share?.link || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → Refrens create body) ─────────────────────────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    currency: invoice.currency,
    items: invoice.lineItems?.map((li) => ({
      name: li.itemDescription,
      rate: li.unitAmount,
      quantity: li.unitQuantity ?? 1,
    })),
  }
}
