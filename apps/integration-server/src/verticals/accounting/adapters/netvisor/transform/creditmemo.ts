import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface NetvisorCreditMemo {
  NetvisorKey: number
  CreditMemoNumber: number
  CustomerIdentifier: string
  Currency: string
  CreditMemoDate: string
  DueDate: string
  Amount: number
  VatAmount: number
  OpenAmount: number
  PaidAmount: number
  Status: string
  [key: string]: unknown
}

function mapStatus(raw: NetvisorCreditMemo): CreditMemoStatus {
  switch (raw.Status) {
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Open':
      return 'AUTHORIZED'
    default:
      return 'DRAFT'
  }
}

export function transformCreditMemo(raw: NetvisorCreditMemo): CreditMemo {
  return {
    id: String(raw.NetvisorKey),
    status: mapStatus(raw),
    creditmemoNumber: raw.CreditMemoNumber ? String(raw.CreditMemoNumber) : undefined,
    contactId: raw.CustomerIdentifier || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.VatAmount,
    balanceAmount: raw.OpenAmount,
    paidAmount: raw.PaidAmount || undefined,
    postedAt: raw.CreditMemoDate ? new Date(raw.CreditMemoDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
