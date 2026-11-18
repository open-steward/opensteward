/**
 * MRI Software — Purchase Order transform.
 *
 * MRI's AP module includes purchase orders raised against vendors.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface MriPurchaseOrderLine {
  id: string
  description?: string
  accountId?: string
  itemId?: string
  unitAmount?: number
  quantity?: number
  taxAmount?: number
  totalAmount?: number
  [key: string]: unknown
}

export interface MriPurchaseOrder {
  id: string
  orderNumber?: string
  vendorId?: string
  currencyCode?: string
  status?: string
  totalAmount?: number
  orderDate?: string
  deliveryDate?: string
  lines?: MriPurchaseOrderLine[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
    case 'RECEIVED':
    case 'CLOSED':
      return 'COMPLETED'
    case 'CANCELLED':
    case 'VOIDED':
      return 'CANCELLED'
    case 'ACTIVE':
    case 'OPEN':
    case 'APPROVED':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MriPurchaseOrderLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountId || undefined,
    itemId: line.itemId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount,
    unitQuantity: line.quantity,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmount,
  }
}

export function transformPurchaseOrder(raw: MriPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.vendorId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
