/**
 * Transform Abacus ERP expense records to the canonical Expense schema.
 *
 * Abacus exposes employee expenses through the OData entity set "Expenses".
 *
 * Key Abacus expense fields:
 *   Id              – numeric string primary key
 *   Name / Description – expense description
 *   AccountId       – GL account foreign key
 *   ContactId       – associated contact/employee (AddressId)
 *   UserId          – submitting employee user ID
 *   CurrencyCode    – ISO 4217 code
 *   PaymentMethod   – payment instrument string
 *   TaxAmount       – total VAT (decimal, NOT minor units)
 *   TotalAmount     – gross total (decimal, NOT minor units)
 *   ReimbursedAmount – amount reimbursed (decimal)
 *   ExpenseDate     – ISO date string (yyyy-MM-dd); date of expense
 *   ApprovedAt      – ISO datetime string
 *   ReimbursedAt    – ISO datetime string
 *   Positions       – line items array
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

// ── Abacus payload types ──────────────────────────────────────────────────────

export interface AbacusExpensePosition {
  Id?: string | number
  AccountId?: string | number
  Description?: string
  Quantity?: number
  UnitPrice?: number
  TotalPrice?: number
  TaxAmount?: number
  [key: string]: unknown
}

export interface AbacusExpense {
  Id: string | number
  Name?: string
  Description?: string
  AccountId?: string | number
  ContactId?: string | number
  UserId?: string | number
  CurrencyCode?: string
  PaymentMethod?: string
  TaxAmount?: number
  TotalAmount?: number
  ReimbursedAmount?: number
  ExpenseDate?: string
  ApprovedAt?: string
  ReimbursedAt?: string
  Positions?: AbacusExpensePosition[]
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Line items ────────────────────────────────────────────────────────────────

function mapPositions(positions: AbacusExpensePosition[]): Lineitem[] {
  return (positions ?? []).map((p) => ({
    id: p.Id != null ? String(p.Id) : undefined,
    accountId: p.AccountId != null ? String(p.AccountId) : undefined,
    itemDescription: p.Description || undefined,
    unitAmount: p.UnitPrice != null ? Math.round(p.UnitPrice * 100) : undefined,
    unitQuantity: p.Quantity != null ? Math.round(p.Quantity) : undefined,
    taxAmount: p.TaxAmount != null ? Math.round(p.TaxAmount * 100) : undefined,
    totalAmount: p.TotalPrice != null ? Math.round(p.TotalPrice * 100) : undefined,
  }))
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus expense OData record to the canonical Expense type. */
export function transformExpense(raw: AbacusExpense): Expense {
  return {
    id: String(raw.Id),
    name: raw.Name || raw.Description || undefined,
    accountId: raw.AccountId != null ? String(raw.AccountId) : undefined,
    contactId: raw.ContactId != null ? String(raw.ContactId) : undefined,
    userId: raw.UserId != null ? String(raw.UserId) : undefined,
    currency: raw.CurrencyCode || undefined,
    paymentMethod: raw.PaymentMethod || undefined,
    taxAmount: raw.TaxAmount != null ? Math.round(raw.TaxAmount * 100) : undefined,
    totalAmount: raw.TotalAmount != null ? Math.round(raw.TotalAmount * 100) : undefined,
    reimbursedAmount:
      raw.ReimbursedAmount != null ? Math.round(raw.ReimbursedAmount * 100) : undefined,
    lineItems: raw.Positions ? mapPositions(raw.Positions) : undefined,
    postedAt: raw.ExpenseDate ? new Date(raw.ExpenseDate) : undefined,
    approvedAt: raw.ApprovedAt ? new Date(raw.ApprovedAt) : undefined,
    reimbursedAt: raw.ReimbursedAt ? new Date(raw.ReimbursedAt) : undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
