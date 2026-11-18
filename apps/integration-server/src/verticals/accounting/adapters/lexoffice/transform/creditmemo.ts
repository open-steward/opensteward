import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface LexofficeCreditNote {
  id: string
  voucherNumber: string
  voucherDate: string
  contactId: string
  totalAmount: number
  openAmount: number
  currency: string
  voucherStatus: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid':
    case 'paidoff': return 'PAID'
    case 'voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: LexofficeCreditNote): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw.voucherStatus),
    creditmemoNumber: raw.voucherNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    balanceAmount: raw.openAmount,
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
