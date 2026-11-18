import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface ExactCreditNote {
  EntryID?: string
  InvoiceNumber?: string
  Customer?: string
  AmountDC?: number
  VATAmountDC?: number
  AmountDCOpen?: number
  Currency?: string
  Status?: number
  EntryDate?: string
  DueDate?: string
  [key: string]: unknown
}

function mapStatus(status: number | undefined): CreditMemoStatus {
  switch (status) {
    case 10:
      return 'DRAFT'
    case 20:
      return 'AUTHORIZED'
    case 50:
      return 'PAID'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: ExactCreditNote): CreditMemo {
  return {
    id: raw.EntryID || undefined,
    creditmemoNumber: raw.InvoiceNumber || undefined,
    contactId: raw.Customer || undefined,
    status: mapStatus(raw.Status),
    totalAmount: raw.AmountDC,
    taxAmount: raw.VATAmountDC,
    balanceAmount: raw.AmountDCOpen,
    currency: raw.Currency || undefined,
    postedAt: raw.EntryDate ? new Date(raw.EntryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
