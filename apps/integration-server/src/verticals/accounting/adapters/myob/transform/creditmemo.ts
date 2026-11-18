import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'

export interface MyobCreditNote {
  UID?: string
  Number?: string
  Customer?: { UID?: string }
  Date?: string
  TotalAmount?: number
  TotalTax?: number
  BalanceDueAmount?: number
  Status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): CreditMemoStatus {
  switch (status) {
    case 'Open':
      return 'AUTHORIZED'
    case 'Closed':
      return 'PAID'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'AUTHORIZED'
  }
}

export function transformCreditMemo(raw: MyobCreditNote): CreditMemo {
  return {
    id: raw.UID || undefined,
    creditmemoNumber: raw.Number || undefined,
    contactId: raw.Customer?.UID || undefined,
    status: mapStatus(raw.Status),
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TotalTax,
    balanceAmount: raw.BalanceDueAmount,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
