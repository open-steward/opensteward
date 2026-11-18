/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FoundationBillLine {
  LineId: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  TaxAmount: number
  AccountNumber: string
  [key: string]: unknown
}

export interface FoundationBill {
  BillNumber: string
  JobNumber: string
  VendorId: string
  BillDate: string
  DueDate: string
  Amount: number
  TaxAmount: number
  Currency: string
  Status: string
  Lines: FoundationBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Void':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: FoundationBillLine): Lineitem {
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

export function transformBill(raw: FoundationBill): Bill {
  return {
    id: String(raw.BillNumber),
    status: mapStatus(raw.Status),
    billNumber: raw.BillNumber || undefined,
    contactId: raw.VendorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.TaxAmount || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.BillDate ? new Date(raw.BillDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
