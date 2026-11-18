/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FoundationCreditMemoLine {
  LineId: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  TaxAmount: number
  AccountNumber: string
  [key: string]: unknown
}

export interface FoundationCreditMemo {
  CreditMemoNumber: string
  VendorId: string
  CreditMemoDate: string
  Amount: number
  TaxAmount: number
  Currency: string
  Status: string
  Lines: FoundationCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Void':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: FoundationCreditMemoLine): Lineitem {
  return {
    id: String(line.LineId),
    accountId: line.AccountNumber || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.TaxAmount || undefined,
  }
}

export function transformCreditMemo(raw: FoundationCreditMemo): CreditMemo {
  return {
    id: String(raw.CreditMemoNumber),
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
