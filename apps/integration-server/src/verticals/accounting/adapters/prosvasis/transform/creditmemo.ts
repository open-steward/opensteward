import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ProsvasisCreditMemoLine {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  VatAmount: number
  AccountCode: string
  Discount: number
  [key: string]: unknown
}

export interface ProsvasisCreditMemo {
  id: string | number
  SeriesNumber: string
  Status: string
  Date: string
  TotalAmount: number
  VatAmount: number
  Currency: string
  CustomerId: string | number
  Lines: ProsvasisCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Issued':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ProsvasisCreditMemoLine): Lineitem {
  return {
    id: String(line.Id),
    accountId: line.AccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.VatAmount || undefined,
    discountAmount: line.Discount || undefined,
  }
}

export function transformCreditMemo(raw: ProsvasisCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.SeriesNumber || undefined,
    contactId: raw.CustomerId ? String(raw.CustomerId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
