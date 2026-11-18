/**
 * Transform Abacus ERP bill (accounts-payable) records to the canonical Bill schema.
 *
 * Abacus exposes AP bills through the OData entity set "Bills" (sometimes
 * "CreditorInvoices" in older Abacus versions).
 *
 * Key Abacus bill fields:
 *   Id              – numeric string primary key
 *   BillNumber      – supplier's invoice number
 *   CreditorId      – foreign key to the creditor/supplier address
 *   BillDate        – ISO date string (yyyy-MM-dd)
 *   DueDate         – payment due date
 *   TotalAmount     – gross total (decimal, NOT minor units)
 *   OpenAmount      – outstanding balance
 *   PaidAmount      – amount already paid
 *   TaxAmount       – total VAT
 *   CurrencyCode    – ISO 4217
 *   Status          – platform status string
 *   Positions       – line items array
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

// ── Abacus payload types ──────────────────────────────────────────────────────

export interface AbacusBillPosition {
  Id?: string | number
  AccountId?: string | number
  ArticleId?: string | number
  Description?: string
  Quantity?: number
  UnitPrice?: number
  TotalPrice?: number
  TaxAmount?: number
  [key: string]: unknown
}

export interface AbacusBill {
  Id: string | number
  BillNumber?: string
  CreditorId?: string | number
  BillDate?: string
  DueDate?: string
  TotalAmount?: number
  OpenAmount?: number
  PaidAmount?: number
  TaxAmount?: number
  CurrencyCode?: string
  Status?: string
  Notes?: string
  Positions?: AbacusBillPosition[]
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: AbacusBill): BillStatus {
  const s = (raw.Status ?? '').toLowerCase()
  if (s === 'paid' || s === 'bezahlt' || s === 'closed') return 'PAID'
  if (s === 'voided' || s === 'cancelled' || s === 'storniert') return 'VOIDED'
  if (s === 'draft' || s === 'entwurf') return 'DRAFT'
  const open = raw.OpenAmount ?? 0
  const total = raw.TotalAmount ?? 0
  if (open === 0 && total > 0) return 'PAID'
  if (open > 0 && open < total) return 'PARTIALLY_PAID'
  if (open > 0 && raw.DueDate && new Date(raw.DueDate).getTime() < Date.now()) return 'OVERDUE'
  if (open > 0) return 'AUTHORIZED'
  return 'AUTHORIZED'
}

// ── Line items ────────────────────────────────────────────────────────────────

function mapPositions(positions: AbacusBillPosition[]): Lineitem[] {
  return (positions ?? []).map((p) => ({
    id: p.Id != null ? String(p.Id) : undefined,
    accountId: p.AccountId != null ? String(p.AccountId) : undefined,
    itemId: p.ArticleId != null ? String(p.ArticleId) : undefined,
    itemDescription: p.Description || undefined,
    unitAmount: p.UnitPrice != null ? Math.round(p.UnitPrice * 100) : undefined,
    unitQuantity: p.Quantity != null ? Math.round(p.Quantity) : undefined,
    taxAmount: p.TaxAmount != null ? Math.round(p.TaxAmount * 100) : undefined,
    totalAmount: p.TotalPrice != null ? Math.round(p.TotalPrice * 100) : undefined,
  }))
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus bill OData record to the canonical Bill type. */
export function transformBill(raw: AbacusBill): Bill {
  return {
    id: String(raw.Id),
    status: mapStatus(raw),
    billNumber: raw.BillNumber || undefined,
    contactId: raw.CreditorId != null ? String(raw.CreditorId) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TotalAmount != null ? Math.round(raw.TotalAmount * 100) : undefined,
    taxAmount: raw.TaxAmount != null ? Math.round(raw.TaxAmount * 100) : undefined,
    paidAmount: raw.PaidAmount != null ? Math.round(raw.PaidAmount * 100) : undefined,
    balanceAmount: raw.OpenAmount != null ? Math.round(raw.OpenAmount * 100) : undefined,
    notes: raw.Notes || undefined,
    lineItems: raw.Positions ? mapPositions(raw.Positions) : undefined,
    postedAt: raw.BillDate ? new Date(raw.BillDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
