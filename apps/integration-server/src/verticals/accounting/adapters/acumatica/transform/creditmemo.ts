import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AcumaticaCreditMemoLine {
  LineNbr: number
  InventoryID: string
  Description: string
  Qty: number
  UnitPrice: number
  ExtPrice: number
  TaxAmt: number
  AccountID: string
  [key: string]: unknown
}

export interface AcumaticaCreditMemo {
  RefNbr: string
  Type: string
  Status: string
  Amount: number
  TaxTotal: number
  CurrencyID: string
  CustomerID: string
  DocDate: string
  Details: AcumaticaCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Open':
      return 'AUTHORIZED'
    case 'Closed':
      return 'PAID'
    case 'Hold':
      return 'DRAFT'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcumaticaCreditMemoLine): Lineitem {
  return {
    id: String(line.LineNbr),
    accountId: line.AccountID || undefined,
    itemId: line.InventoryID || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Qty,
    totalAmount: line.ExtPrice,
    taxAmount: line.TaxAmt || undefined,
  }
}

export function transformCreditMemo(raw: AcumaticaCreditMemo): CreditMemo {
  return {
    id: raw.RefNbr,
    status: mapStatus(raw.Status),
    contactId: raw.CustomerID || undefined,
    currency: raw.CurrencyID || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.TaxTotal || undefined,
    lineItems: (raw.Details ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
