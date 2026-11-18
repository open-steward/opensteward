import type { CreditMemo } from '../../../schema/creditmemo'

export interface InbooksCreditMemo {
  id: number | string
  credit_note_number?: string
  contact_id?: number | string
  date?: string
  currency?: string
  total_amount?: number
  tax_amount?: number
  status?: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: InbooksCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
