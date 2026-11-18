/**
 * Bind ERP → canonical CreditMemo transform.
 *
 * Source: POST /api/CreditNotes  (write-only; returns the new ID as a GUID string)
 *
 * Bind ERP's CreditNotes API only supports creating a credit note —
 * there is no GET list or GET by-ID endpoint.  After a successful
 * POST the API returns the new document's GUID.  We echo the input
 * data back as the canonical CreditMemo (the caller owns the
 * source-of-truth until a future GET endpoint is added).
 *
 * NewCreditNote fields (SDK v1):
 *   Amount (required), InvoiceID (required), PaymentMethod (required),
 *   PaymentTerms (required), Type (required),
 *   BankAccount, Comments, Concept, Unit,
 *   CreditNotesItems[] ({ ID, Qty }),
 *   IEPSAmount, ISRRet, SeriesID, VAT, VATRet
 */

import type { CreditMemo } from '../../../schema/creditmemo'

// ── Raw Bind ERP types ──────────────────────────────────────────────────────

export interface BindNewCreditNote {
  Amount?: number
  BankAccount?: string
  Comments?: string
  Concept?: string
  Unit?: string
  CreditNotesItems?: Array<{ ID?: string; Qty?: number }>
  IEPSAmount?: number
  InvoiceID?: string
  ISRRet?: number
  PaymentMethod?: number
  PaymentTerms?: number
  SeriesID?: string
  Type?: number
  VAT?: number
  VATRet?: number
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Build a minimal CreditMemo from the data we sent to POST /api/CreditNotes
 * plus the ID returned by the API.  All fields are best-effort; no GET
 * endpoint exists to retrieve the full document after creation.
 */
export function buildCreditMemoFromCreate(
  id: string,
  input: Partial<CreditMemo>,
): CreditMemo {
  return {
    id,
    status: 'AUTHORIZED',
    contactId: input.contactId,
    currency: input.currency,
    totalAmount: input.totalAmount,
    taxAmount: input.taxAmount,
    notes: input.notes,
    lineItems: input.lineItems,
    postedAt: input.postedAt ?? new Date(),
    createdAt: new Date(),
    metadata: { sourceId: id },
  }
}
