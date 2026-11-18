import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface DineroCreditMemo {
  Guid: string
  Number: number
  ContactGuid: string
  Currency: string
  Date: string
  PaymentDate: string
  TotalInclVat: number
  TotalVat: number
  RemainingAmount: number
  PaymentAmount: number
  Status: 'Draft' | 'Booked' | 'Paid' | 'PartPayment' | 'Voided'
  [key: string]: unknown
}

function mapStatus(status: DineroCreditMemo['Status']): CreditMemoStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Booked':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'PartPayment':
      return 'PARTIALLY_PAID'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: DineroCreditMemo): CreditMemo {
  return {
    id: raw.Guid,
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.Number != null ? String(raw.Number) : undefined,
    contactId: raw.ContactGuid || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalInclVat,
    taxAmount: raw.TotalVat,
    balanceAmount: raw.RemainingAmount,
    paidAmount: raw.PaymentAmount || undefined,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.PaymentDate ? new Date(raw.PaymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
