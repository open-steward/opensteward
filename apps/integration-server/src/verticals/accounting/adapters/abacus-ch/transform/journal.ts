/**
 * Transform Abacus ERP journal (booking) records to the canonical Journal schema.
 *
 * Abacus exposes journal entries through the OData entity set "Journals"
 * (also referred to as "BookingEntries" in some versions).
 *
 * Key Abacus journal fields:
 *   Id              – numeric string primary key
 *   Description     – journal/booking description text
 *   Reference       – external reference (e.g. document number)
 *   CurrencyCode    – ISO 4217 code
 *   TaxAmount       – total VAT amount (decimal, NOT minor units)
 *   TaxCodeId       – foreign key to TaxCodes entity
 *   BookingDate     – ISO date string (yyyy-MM-dd); when the entry was posted
 *   Positions       – array of debit/credit lines (JournalEntries)
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

// ── Abacus payload types ──────────────────────────────────────────────────────

export interface AbacusJournalPosition {
  Id?: string | number
  AccountId?: string | number
  ContactId?: string | number
  InvoiceId?: string | number
  Description?: string
  DebitAmount?: number
  CreditAmount?: number
  TaxAmount?: number
  TotalAmount?: number
  [key: string]: unknown
}

export interface AbacusJournal {
  Id: string | number
  Description?: string
  Reference?: string
  Source?: string
  CurrencyCode?: string
  TaxAmount?: number
  TaxCodeId?: string | number
  BookingDate?: string
  Positions?: AbacusJournalPosition[]
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Line items ────────────────────────────────────────────────────────────────

function mapPositions(positions: AbacusJournalPosition[]): JournalLineitem[] {
  return (positions ?? []).map((p) => ({
    id: p.Id != null ? String(p.Id) : undefined,
    accountId: p.AccountId != null ? String(p.AccountId) : undefined,
    contactId: p.ContactId != null ? String(p.ContactId) : undefined,
    invoiceId: p.InvoiceId != null ? String(p.InvoiceId) : undefined,
    description: p.Description || undefined,
    debitAmount: p.DebitAmount != null ? Math.round(p.DebitAmount * 100) : undefined,
    creditAmount: p.CreditAmount != null ? Math.round(p.CreditAmount * 100) : undefined,
    taxAmount: p.TaxAmount != null ? Math.round(p.TaxAmount * 100) : undefined,
    totalAmount: p.TotalAmount != null ? Math.round(p.TotalAmount * 100) : undefined,
  }))
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus journal OData record to the canonical Journal type. */
export function transformJournal(raw: AbacusJournal): Journal {
  return {
    id: String(raw.Id),
    description: raw.Description || undefined,
    reference: raw.Reference || undefined,
    source: raw.Source || undefined,
    currency: raw.CurrencyCode || undefined,
    taxAmount: raw.TaxAmount != null ? Math.round(raw.TaxAmount * 100) : undefined,
    taxrateId: raw.TaxCodeId != null ? String(raw.TaxCodeId) : undefined,
    lineItems: raw.Positions ? mapPositions(raw.Positions) : undefined,
    postedAt: raw.BookingDate ? new Date(raw.BookingDate) : undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
