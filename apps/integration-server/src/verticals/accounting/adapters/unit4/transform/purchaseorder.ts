/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface Unit4PurchaseOrderLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount?: number
  accountCode?: string
  [key: string]: unknown
}

export interface Unit4PurchaseOrder {
  purchaseOrderId: string | number
  orderNumber?: string
  status: string
  supplierId?: string | number
  amount: number
  currencyCode?: string
  orderDate?: string
  companyId?: string | number
  lines?: Unit4PurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Received':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Active':
    case 'Approved':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: Unit4PurchaseOrderLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: Unit4PurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.purchaseOrderId),
    status: mapStatus(raw.status),
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
