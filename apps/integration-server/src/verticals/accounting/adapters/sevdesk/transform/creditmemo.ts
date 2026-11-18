import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface SevDeskCreditNote {
  id: string
  invoiceNumber: string
  contact: { id: string } | null
  invoiceDate: string
  payDate: string | null
  currency: string
  sumNet: string
  sumGross: string
  sumTax: string
  sumDiscounts: string
  status: string
  [key: string]: unknown
}

function mapStatus(raw: SevDeskCreditNote): CreditMemoStatus {
  if (raw.status === '1000') return 'VOIDED'
  if (raw.payDate) return 'PAID'
  if (raw.status === '200') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: SevDeskCreditNote): CreditMemo {
  return {
    id: raw.id,
    status: mapStatus(raw),
    creditmemoNumber: raw.invoiceNumber || undefined,
    contactId: raw.contact?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.sumGross) || undefined,
    taxAmount: parseFloat(raw.sumTax) || undefined,
    discountAmount: parseFloat(raw.sumDiscounts) || undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    paidAt: raw.payDate ? new Date(raw.payDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
