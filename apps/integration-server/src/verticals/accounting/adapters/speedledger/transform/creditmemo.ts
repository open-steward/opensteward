import type { CreditMemo } from '../../../schema/creditmemo'

export interface SpeedLedgerCreditMemo {
  id: number | string
  creditNumber?: string
  contactId?: number | string
  date?: string
  currency?: string
  totalInclVat?: number
  totalVat?: number
  status?: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: SpeedLedgerCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.creditNumber || undefined,
    contactId: raw.contactId !== undefined ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalInclVat,
    taxAmount: raw.totalVat,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
