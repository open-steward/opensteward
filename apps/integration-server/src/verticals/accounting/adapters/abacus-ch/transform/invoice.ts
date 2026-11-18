import { toCalendarDate } from '../../shared/transform'
/**
 * Transform Abacus ERP invoice (accounts-receivable) records to and from
 * the canonical Invoice schema.
 *
 * Abacus exposes AR invoices through the OData entity set "Invoices".
 * Field names follow Abacus naming conventions (PascalCase).
 *
 * Key Abacus invoice fields:
 *   Id                – numeric string primary key
 *   InvoiceNumber     – human-readable invoice number
 *   CustomerId        – foreign key to Addresses/Customers entity
 *   InvoiceDate       – ISO date string (yyyy-MM-dd)
 *   DueDate           – ISO date string
 *   TotalAmount       – gross total in document currency (decimal, NOT minor units)
 *   OpenAmount        – outstanding balance (decimal)
 *   PaidAmount        – amount already collected (decimal)
 *   CurrencyCode      – ISO 4217 code
 *   Status            – platform status string
 *   Positions         – array of line items
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Abacus payload types ──────────────────────────────────────────────────────

export interface AbacusInvoicePosition {
  Id?: string | number
  ArticleId?: string | number
  ArticleNumber?: string
  Description?: string
  Quantity?: number
  UnitPrice?: number
  TotalPrice?: number
  TaxAmount?: number
  DiscountAmount?: number
  [key: string]: unknown
}

export interface AbacusInvoice {
  Id: string | number
  InvoiceNumber?: string
  CustomerId?: string | number
  InvoiceDate?: string
  DueDate?: string
  TotalAmount?: number
  OpenAmount?: number
  PaidAmount?: number
  TaxAmount?: number
  DiscountAmount?: number
  CurrencyCode?: string
  Status?: string
  Notes?: string
  Positions?: AbacusInvoicePosition[]
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: AbacusInvoice): InvoiceStatus {
  const s = (raw.Status ?? '').toLowerCase()
  if (s === 'paid' || s === 'bezahlt' || s === 'closed') return 'PAID'
  if (s === 'voided' || s === 'cancelled' || s === 'storniert') return 'VOIDED'
  if (s === 'draft' || s === 'entwurf') return 'DRAFT'
  // Derive from balances when status string is ambiguous
  const open = raw.OpenAmount ?? 0
  const total = raw.TotalAmount ?? 0
  if (open === 0 && total > 0) return 'PAID'
  if (open > 0 && open < total) return 'PARTIALLY_PAID'
  if (
    open > 0 &&
    raw.DueDate &&
    new Date(raw.DueDate).getTime() < Date.now()
  )
    return 'OVERDUE'
  if (open > 0) return 'AUTHORIZED'
  return 'AUTHORIZED'
}

// ── Line items ────────────────────────────────────────────────────────────────

function mapPositions(positions: AbacusInvoicePosition[]): Lineitem[] {
  return (positions ?? []).map((p) => ({
    id: p.Id != null ? String(p.Id) : undefined,
    itemId: p.ArticleId != null ? String(p.ArticleId) : undefined,
    itemSku: p.ArticleNumber || undefined,
    itemDescription: p.Description || undefined,
    unitAmount: p.UnitPrice != null ? Math.round(p.UnitPrice * 100) : undefined,
    unitQuantity: p.Quantity != null ? Math.round(p.Quantity) : undefined,
    discountAmount: p.DiscountAmount != null ? Math.round(p.DiscountAmount * 100) : undefined,
    taxAmount: p.TaxAmount != null ? Math.round(p.TaxAmount * 100) : undefined,
    totalAmount: p.TotalPrice != null ? Math.round(p.TotalPrice * 100) : undefined,
  }))
}

// ── Main transforms ───────────────────────────────────────────────────────────

/** Convert an Abacus invoice OData record to the canonical Invoice type. */
export function transformInvoice(raw: AbacusInvoice): Invoice {
  return {
    id: String(raw.Id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.CustomerId != null ? String(raw.CustomerId) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TotalAmount != null ? Math.round(raw.TotalAmount * 100) : undefined,
    taxAmount: raw.TaxAmount != null ? Math.round(raw.TaxAmount * 100) : undefined,
    discountAmount: raw.DiscountAmount != null ? Math.round(raw.DiscountAmount * 100) : undefined,
    paidAmount: raw.PaidAmount != null ? Math.round(raw.PaidAmount * 100) : undefined,
    balanceAmount: raw.OpenAmount != null ? Math.round(raw.OpenAmount * 100) : undefined,
    notes: raw.Notes || undefined,
    lineItems: raw.Positions ? mapPositions(raw.Positions) : undefined,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Convert a partial canonical Invoice to an Abacus create/update payload. */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    InvoiceNumber: invoice.invoiceNumber,
    CustomerId: invoice.contactId ? Number(invoice.contactId) : undefined,
    CurrencyCode: invoice.currency,
    InvoiceDate: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    Notes: invoice.notes,
    Positions: invoice.lineItems?.map((li) => ({
      ArticleId: li.itemId ? Number(li.itemId) : undefined,
      ArticleNumber: li.itemSku,
      Description: li.itemDescription,
      Quantity: li.unitQuantity,
      UnitPrice: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      TotalPrice: li.totalAmount != null ? li.totalAmount / 100 : undefined,
    })),
  }
}
