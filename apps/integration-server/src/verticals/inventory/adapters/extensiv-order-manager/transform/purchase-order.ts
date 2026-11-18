/**
 * Transform Extensiv Order Manager purchase order → canonical PurchaseOrder.
 *
 * Real API: GET /api/v1.1/purchaseorders
 * Key fields: purchaseOrderId, number, customPurchaseOrderNumber, vendorId,
 *             destinationWarehouseId, status, currency,
 *             shippingCost { amount (integer minor units), currency },
 *             dateCreated, dateIssued, dateAuthorized,
 *             purchaseOrderItems[]: { productStockId, vendorProductMasterSku,
 *               quantity, originalUnitCost { amount, currency }, status,
 *               estimatedDeliveryDate, receivedDate }
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawExtensivPurchaseOrderItem {
  purchaseOrderItemId?: number | string | null
  productStockId?: number | string | null
  vendorProductId?: number | string | null
  vendorProductMasterSku?: string | null
  vendorProductVendorSku?: string | null
  quantity?: number | null
  /** unit cost in INTEGER MINOR UNITS */
  originalUnitCost?: { amount?: number | null; currency?: string | null } | null
  /** billed cost in INTEGER MINOR UNITS */
  billedUnitCost?: { amount?: number | null; currency?: string | null } | null
  status?: string | null
  estimatedDeliveryDate?: string | null
  deliveryDate?: string | null
  receivedDate?: string | null
  [key: string]: unknown
}

export interface RawExtensivPurchaseOrder {
  purchaseOrderId?: number | string | null
  number?: string | null
  customPurchaseOrderNumber?: string | null
  vendorId?: number | string | null
  destinationWarehouseId?: number | string | null
  status?: string | null
  currency?: string | null
  /** total shipping cost in INTEGER MINOR UNITS */
  shippingCost?: { amount?: number | null; currency?: string | null } | null
  dateCreated?: string | null
  dateIssued?: string | null
  dateAuthorized?: string | null
  dateModified?: string | null
  vendorConfirmByDate?: string | null
  purchaseOrderItems?: RawExtensivPurchaseOrderItem[] | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'PENDING': case 'ISSUED': case 'AUTHORIZED': return 'sent'
    case 'PARTIALLY RECEIVED': case 'PARTIAL': return 'partially_received'
    case 'RECEIVED': case 'FULLY RECEIVED': return 'received'
    case 'CLOSED': case 'COMPLETE': case 'COMPLETED': return 'closed'
    case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawExtensivPurchaseOrder): PurchaseOrder {
  const id = String(raw.purchaseOrderId ?? '')
  const shippingCostAmount = raw.shippingCost?.amount ?? undefined

  return {
    id,
    externalId: id,
    number: pickStr(raw.customPurchaseOrderNumber) ?? pickStr(raw.number),
    supplierId: String(raw.vendorId ?? ''),
    destinationLocationId: raw.destinationWarehouseId != null ? String(raw.destinationWarehouseId) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    // shippingCost is already integer minor units
    totalAmount: shippingCostAmount,
    lines: (raw.purchaseOrderItems ?? []).map((item) => ({
      productId: String(item.productStockId ?? item.vendorProductId ?? ''),
      quantityOrdered: item.quantity ?? 0,
      // unit cost is integer minor units (cents)
      unitCost: item.originalUnitCost?.amount ?? item.billedUnitCost?.amount ?? undefined,
    })),
    orderedAt: toIso(raw.dateIssued) ?? toIso(raw.dateCreated),
    expectedAt: toIso(raw.vendorConfirmByDate),
    platform: 'extensiv-order-manager',
    metadata: strMap({
      dateAuthorized: raw.dateAuthorized,
      dateModified: raw.dateModified,
      status: raw.status,
    }),
    raw,
  }
}
