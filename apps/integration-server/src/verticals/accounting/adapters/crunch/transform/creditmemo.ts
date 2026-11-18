import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

// ── Crunch wire types ─────────────────────────────────────────────────────────

/**
 * CreditNoteDto as it appears in the `creditNotes` array of a
 * GET /invoices/{id} response.
 */
export interface CrunchCreditNoteDto {
  id?: number
  date?: string
  amount?: number
  state?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

const STATE_MAP: Record<string, CreditMemoStatus> = {
  DRAFT: 'DRAFT',
  ISSUED: 'AUTHORIZED',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  VOIDED: 'VOIDED',
  DELETED: 'DELETED',
}

function mapStatus(raw: string | undefined): CreditMemoStatus {
  if (!raw) return 'DRAFT'
  const upper = raw.toUpperCase()
  return STATE_MAP[upper] ?? 'AUTHORIZED'
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a Crunch CreditNoteDto (embedded in an invoice) into the
 * canonical CreditMemo shape.
 *
 * Crunch does not have a dedicated credit-note API endpoint; credit notes
 * are returned as the `creditNotes` array inside GET /invoices/{id}.
 * We materialise each entry as a standalone CreditMemo via this transform.
 *
 * @param raw      The CreditNoteDto object from the invoice creditNotes array.
 * @param invoiceId The parent invoice ID, stored in metadata for traceability.
 * @param contactId The invoice's contactId passed through for the credit memo.
 */
export function transformCreditNote(
  raw: CrunchCreditNoteDto,
  invoiceId?: string,
  contactId?: string,
): CreditMemo {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    status: mapStatus(raw.state),
    contactId,
    totalAmount: raw.amount !== undefined ? Math.round(raw.amount * 100) : undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    // The note was read out of this invoice's own `creditNotes[]`, so the
    // invoice it credits is known by construction. `_invoiceId` stays in
    // metadata for callers that read it before `appliedTo` existed.
    appliedTo: invoiceId ? [{ invoiceId }] : undefined,
    metadata: { ...raw, _invoiceId: invoiceId } as Record<string, unknown>,
  }
}
