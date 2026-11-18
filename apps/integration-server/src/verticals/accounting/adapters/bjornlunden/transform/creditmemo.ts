import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface BlCreditMemo {
  Id: string
  CreditMemoNumber: number
  CustomerId: string
  Currency: string
  CreditMemoDate: string
  DueDate: string
  TotalAmount: number
  VatAmount: number
  RemainingAmount: number
  PaidAmount: number
  Status: string
  [key: string]: unknown
}

function mapStatus(raw: BlCreditMemo): CreditMemoStatus {
  switch (raw.Status) {
    case 'Paid':
      return 'PAID'
    case 'PartiallyPaid':
      return 'PARTIALLY_PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Approved':
      return 'AUTHORIZED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: BlCreditMemo): CreditMemo {
  return {
    id: raw.Id,
    status: mapStatus(raw),
    creditmemoNumber: raw.CreditMemoNumber ? String(raw.CreditMemoNumber) : undefined,
    contactId: raw.CustomerId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    balanceAmount: raw.RemainingAmount,
    paidAmount: raw.PaidAmount,
    postedAt: raw.CreditMemoDate ? new Date(raw.CreditMemoDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
