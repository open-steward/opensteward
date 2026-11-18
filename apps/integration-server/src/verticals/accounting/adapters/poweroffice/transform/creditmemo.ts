import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface PowerOfficeCreditNote {
  id: number
  customerId: number
  invoiceDate: string
  currencyCode: string
  grossAmount: number
  isPaid: boolean
  isVoid: boolean
  status: number
  [key: string]: unknown
}

function mapStatus(raw: PowerOfficeCreditNote): CreditMemoStatus {
  if (raw.isVoid) return 'VOIDED'
  if (raw.isPaid) return 'PAID'
  if (raw.status === 5) return 'AUTHORIZED'
  if (raw.status === 0) return 'DRAFT'
  return 'AUTHORIZED'
}

export function transformCreditMemo(raw: PowerOfficeCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.grossAmount,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
