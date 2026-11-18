import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

/**
 * Calxa credit note / credit memo record as returned by GET /credit-notes
 * and GET /credit-notes/:id.
 */
export interface CalxaCreditMemo {
  id: string
  /** Human-readable credit note number. */
  creditNoteNumber?: string
  /** Identifier of the contact (customer) this credit note relates to. */
  contactId?: string
  /** Lifecycle status: "draft" | "authorised" | "paid" | "voided" | "deleted". */
  status?: string
  /** ISO 4217 currency code. */
  currency?: string
  /** Total amount of the credit note (positive value). */
  total?: number
  /** Total tax component. */
  totalTax?: number
  /** Outstanding balance remaining on the credit note. */
  remainingCredit?: number
  /** Amount already applied. */
  appliedAmount?: number
  /** ISO 8601 credit note date. */
  date?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(status?: string): CreditMemoStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'authorised':
    case 'authorized':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
    case 'void':
      return 'VOIDED'
    case 'deleted':
      return 'DELETED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: CalxaCreditMemo): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.totalTax ?? undefined,
    balanceAmount: raw.remainingCredit ?? undefined,
    paidAmount: raw.appliedAmount ?? undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
