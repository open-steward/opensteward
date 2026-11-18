import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface BCPurchaseOrder {
  id: string
  number: string
  vendorId?: string
  vendorNumber?: string
  vendorName?: string
  orderDate?: string
  expectedReceiptDate?: string
  currencyCode?: string
  totalAmountIncludingTax: number
  totalTaxAmount?: number
  status: 'Draft' | 'In Review' | 'Open' | 'Partially Received' | 'Received' | 'Invoiced'
  purchaseOrderLines?: Array<{
    id: string
    description?: string
    quantity: number
    directUnitCost: number
    taxAmount: number
    totalAmountIncludingTax: number
    [key: string]: unknown
  }>
  [key: string]: unknown
}

function mapStatus(status: BCPurchaseOrder['status']): PurchaseOrderStatus {
  switch (status) {
    case 'Draft':
    case 'In Review':
      return 'DRAFT'
    case 'Received':
    case 'Invoiced':
      return 'COMPLETED'
    case 'Open':
    case 'Partially Received':
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(line: NonNullable<BCPurchaseOrder['purchaseOrderLines']>[number]): Lineitem {
  return {
    id: line.id,
    itemDescription: line.description || undefined,
    unitAmount: line.directUnitCost,
    unitQuantity: line.quantity,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmountIncludingTax,
  }
}

export function transformPurchaseOrder(raw: BCPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.vendorId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmountIncludingTax,
    lineItems: (raw.purchaseOrderLines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
