import type { CreditMemo } from '../../../schema/creditmemo'

export interface BrioxCreditNote {
  id: number | string
  credit_note_number?: string
  contact_id?: number | string
  date?: string
  total?: number
  vat_amount?: number
  currency?: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: BrioxCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.vat_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
