import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface CmicCreditMemoLine {
  LineId: string
  Description: string
  Quantity: number
  UnitPrice: number
  LineAmount: number
  TaxAmount: number
  AccountCode: string
  CostCode: string
  [key: string]: unknown
}

export interface CmicCreditMemo {
  CreditMemoId: string
  CreditMemoNumber: string
  Status: string
  VendorId: string
  ProjectCode: string
  Currency: string
  Amount: number
  TaxAmount: number
  CreditMemoDate: string
  Lines: CmicCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: CmicCreditMemoLine): Lineitem {
  return {
    id: line.LineId,
    accountId: line.AccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.LineAmount,
    taxAmount: line.TaxAmount || undefined,
  }
}

export function transformCreditMemo(raw: CmicCreditMemo): CreditMemo {
  return {
    id: String(raw.CreditMemoId),
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.CreditMemoNumber || undefined,
    contactId: raw.VendorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.TaxAmount || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.CreditMemoDate ? new Date(raw.CreditMemoDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
