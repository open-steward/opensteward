import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface QBOCreditMemoLine {
  Id: string
  Description: string
  Amount: number
  DetailType: string
  SalesItemLineDetail?: { ItemRef: { value: string }; UnitPrice?: number; Qty?: number }
}

export interface QBOCreditMemo {
  Id: string
  DocNumber: string
  CustomerRef: { value: string }
  TxnDate: string
  TotalAmt: number
  Balance: number
  RemainingCredit: number
  CurrencyRef: { value: string }
  Line: QBOCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(raw: QBOCreditMemo): CreditMemoStatus {
  if (raw.RemainingCredit === 0) return 'PAID'
  if (raw.RemainingCredit < raw.TotalAmt) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLines(lines: QBOCreditMemoLine[]): Lineitem[] {
  return (lines ?? [])
    .filter((l) => l.DetailType === 'SalesItemLineDetail')
    .map((l) => ({
      id: l.Id || undefined,
      itemId: l.SalesItemLineDetail?.ItemRef?.value || undefined,
      itemDescription: l.Description || undefined,
      unitAmount: l.SalesItemLineDetail?.UnitPrice,
      unitQuantity: l.SalesItemLineDetail?.Qty,
      totalAmount: l.Amount,
    }))
}

export function transformCreditMemo(raw: QBOCreditMemo): CreditMemo {
  return {
    id: raw.Id,
    status: mapStatus(raw),
    creditmemoNumber: raw.DocNumber || undefined,
    contactId: raw.CustomerRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    totalAmount: raw.TotalAmt,
    balanceAmount: raw.Balance,
    paidAmount: raw.TotalAmt - raw.RemainingCredit || undefined,
    lineItems: mapLines(raw.Line ?? []),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
