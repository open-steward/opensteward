import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface UnimicroCreditMemo {
  ID?: number
  CreditNoteNumber?: string
  InvoiceDate?: string
  PaymentDueDate?: string
  TaxInclusiveAmount?: number
  TaxAmount?: number
  StatusCode?: number
  CustomerID?: number
  [key: string]: unknown
}

function mapStatus(statusCode?: number): CreditMemoStatus {
  switch (statusCode) {
    case 10:
      return 'DRAFT'
    case 30:
      return 'AUTHORIZED'
    case 50:
      return 'PAID'
    case 40:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: UnimicroCreditMemo): CreditMemo {
  return {
    id: String(raw.ID ?? ''),
    status: mapStatus(raw.StatusCode),
    creditmemoNumber: raw.CreditNoteNumber || undefined,
    contactId: raw.CustomerID !== undefined ? String(raw.CustomerID) : undefined,
    totalAmount: raw.TaxInclusiveAmount,
    taxAmount: raw.TaxAmount,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.PaymentDueDate ? new Date(raw.PaymentDueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
