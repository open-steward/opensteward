import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface MoneybirdCreditNote {
  id?: number | string
  reference?: string
  contact_id?: number | string
  total_price_incl_tax?: string | number
  total_unpaid?: string | number
  currency?: string
  state?: string
  date?: string
  [key: string]: unknown
}

function mapStatus(state: string | undefined): CreditMemoStatus {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'open':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: MoneybirdCreditNote): CreditMemo {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    creditmemoNumber: raw.reference || undefined,
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    status: mapStatus(raw.state),
    totalAmount: raw.total_price_incl_tax !== undefined ? Number(raw.total_price_incl_tax) : undefined,
    balanceAmount: raw.total_unpaid !== undefined ? Number(raw.total_unpaid) : undefined,
    currency: raw.currency || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
