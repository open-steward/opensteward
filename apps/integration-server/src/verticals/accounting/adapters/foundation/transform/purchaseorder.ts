/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FoundationPurchaseOrderLine {
  LineId: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  TaxAmount: number
  AccountNumber: string
  [key: string]: unknown
}

export interface FoundationPurchaseOrder {
  PurchaseOrderId: string | number
  PurchaseOrderNumber: string
  JobNumber: string
  VendorId: string
  OrderDate: string
  TotalAmount: number
  Currency: string
  Status: string
  Lines: FoundationPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Approved':
      return 'ACTIVE'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: FoundationPurchaseOrderLine): Lineitem {
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

export function transformPurchaseOrder(raw: FoundationPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.PurchaseOrderId),
    status: mapStatus(raw.Status),
    contactId: raw.VendorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
