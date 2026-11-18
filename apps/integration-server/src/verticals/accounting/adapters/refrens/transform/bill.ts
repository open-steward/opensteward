import { toCalendarDate } from '../../shared/transform'
/**
 * Refrens expenditure → canonical Bill.
 *
 * Refrens calls purchase records "expenditures". The API exposes a POST
 * endpoint for creation; the list/get surface mirrors the invoice shape but
 * with the vendor in billedBy instead of billedTo.
 *
 * Documented fields (POST /businesses/:urlKey/expenditures response):
 *   _id, invoiceNumber, invoiceDate, currency, status,
 *   billedBy.{ name, email, phone, gstin },
 *   items[].{ name, rate, quantity, igst, cgst, sgst, taxRate, total },
 *   finalTotal.{ total, igst, cgst, sgst, subTotal },
 *   createdAt, updatedAt
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

// ── Raw Refrens types ─────────────────────────────────────────────────────────

export interface RefrensExpenditureItem {
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

export interface RefrensExpenditureFinalTotal {
  total?: number
  igst?: number
  cgst?: number
  sgst?: number
  subTotal?: number
  [key: string]: unknown
}

export interface RefrensExpenditure {
  _id: string
  invoiceNumber?: string
  expenseNumber?: string
  invoiceDate?: string
  dueDate?: string
  currency?: string
  status?: string         // "UNPAID" | "PAID" | "PARTIALLY_PAID" | "CANCELED"
  billedBy?: { name?: string; gstin?: string; [key: string]: unknown }
  items?: RefrensExpenditureItem[]
  finalTotal?: RefrensExpenditureFinalTotal
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: RefrensExpenditure): BillStatus {
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

function mapLineitem(item: RefrensExpenditureItem, idx: number): Lineitem {
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

export function transformBill(raw: RefrensExpenditure): Bill {
  const ft = raw.finalTotal ?? {}
  const taxAmount =
    (ft.igst ?? 0) + (ft.cgst ?? 0) + (ft.sgst ?? 0) || undefined

  return {
    id: raw._id,
    status: mapStatus(raw),
    billNumber: raw.invoiceNumber || raw.expenseNumber || undefined,
    currency: raw.currency || undefined,
    totalAmount: ft.total ?? undefined,
    taxAmount: taxAmount ?? undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical Bill → Refrens create body) ────────────────────────

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    invoiceNumber: bill.billNumber,
    invoiceDate: toCalendarDate(bill.postedAt),
    currency: bill.currency,
    items: bill.lineItems?.map((li) => ({
      name: li.itemDescription,
      rate: li.unitAmount,
      quantity: li.unitQuantity ?? 1,
    })),
  }
}
