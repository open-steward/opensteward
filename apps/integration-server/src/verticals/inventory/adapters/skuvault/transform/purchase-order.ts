import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSkuVaultPurchaseOrder {
  ID: string
  OrderNumber?: string
  Supplier?: string
  SupplierID?: string
  Status?: string
  Currency?: string
  OrderTotal?: number
  Subtotal?: number
  DefaultLocation?: string
  Lines?: Array<{
    ProductID: string
    Quantity: number
    Received?: number
    Price?: number
    Total?: number
  }>
  Order?: string
  ExpectedDeliveryDate?: string
  CompletedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'ORDERED': case 'AUTHORISED': return 'sent'
    case 'PARTIALLY RECEIVED': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'COMPLETED': case 'CLOSED': return 'closed'
    case 'VOIDED': case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSkuVaultPurchaseOrder): PurchaseOrder {
  return {
    id: raw.ID,
    externalId: raw.ID,
    number: pickStr(raw.OrderNumber),
    supplierId: raw.SupplierID ?? raw.Supplier ?? '',
    destinationLocationId: pickStr(raw.DefaultLocation),
    status: mapStatus(raw.Status),
    currency: pickStr(raw.Currency),
    subtotalAmount: raw.Subtotal,
    totalAmount: raw.OrderTotal,
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.ProductID,
      quantityOrdered: l.Quantity,
      quantityReceived: l.Received,
      unitCost: l.Price,
      lineTotal: l.Total,
    })),
    expectedAt: toIso(raw.ExpectedDeliveryDate),
    orderedAt: toIso(raw.Order),
    receivedAt: toIso(raw.CompletedDate),
    platform: 'skuvault',
    metadata: strMap({}),
    raw,
  }
}
