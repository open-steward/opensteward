import type { CreditMemo } from '../../../schema/creditmemo'

export interface WintCreditNote {
  id: number | string
  credit_note_number?: string
  contact_id?: number | string
  date?: string
  gross?: number
  vat?: number
  currency?: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: WintCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.vat,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
