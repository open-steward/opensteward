/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FoundationOrderLine {
  LineId: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  TaxAmount: number
  AccountNumber: string
  [key: string]: unknown
}

export interface FoundationOrder {
  OrderId: string | number
  OrderNumber: string
  JobNumber: string
  VendorId: string
  OrderDate: string
  TotalAmount: number
  Currency: string
  Status: string
  Lines: FoundationOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
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

function mapLineitem(line: FoundationOrderLine): Lineitem {
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

export function transformOrder(raw: FoundationOrder): Order {
  return {
    id: String(raw.OrderId),
    status: mapStatus(raw.Status),
    contactId: raw.VendorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
