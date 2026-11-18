import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface MoneyForwardCreditNote {
  id: string
  credit_note_number: string | null
  credit_note_date: string
  price_before_tax: number
  price: number
  tax: number
  partner_id: string | null
  partner_name: string | null
  [key: string]: unknown
}

function mapStatus(_raw: MoneyForwardCreditNote): CreditMemoStatus {
  // Money Forward credit notes do not expose a granular payment status
  return 'AUTHORIZED'
}

export function transformCreditMemo(raw: MoneyForwardCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.credit_note_number || undefined,
    contactId: raw.partner_id ? String(raw.partner_id) : undefined,
    totalAmount: raw.price,
    taxAmount: raw.tax,
    postedAt: raw.credit_note_date ? new Date(raw.credit_note_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
