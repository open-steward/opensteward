import type { CreditMemo } from '../../../schema/creditmemo'

export interface WrebitCreditMemo {
  id: number | string
  ref?: string
  contact_id?: number | string
  date?: string
  currency?: string
  gross_amount?: number
  vat_amount?: number
  status?: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: WrebitCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.ref || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross_amount,
    taxAmount: raw.vat_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
