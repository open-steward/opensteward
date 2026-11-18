import type { CreditMemo } from '../../../schema/creditmemo'

export interface PromikBookCreditMemo {
  id: number | string
  credit_no?: string
  contact_id?: number | string
  date?: string
  currency?: string
  amount_incl_vat?: number
  vat_amount?: number
  status?: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: PromikBookCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.credit_no || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_vat,
    taxAmount: raw.vat_amount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
