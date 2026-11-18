/**
 * Transform Ongoing WMS purchase order response → canonical PurchaseOrder.
 *
 * GET /purchaseOrders or GET /purchaseOrders/{purchaseOrderId}
 * Real field names from the Ongoing WMS Goods Owner REST API example responses.
 *
 * Status numbers from the API:
 *   10  = Created
 *   20  = Processing
 *   40  = Deviation (partial)
 *   100 = Finished/Closed
 *   900 = Cancelled
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface PurchaseOrderStatus_ {
  number?: number
  text?: string
}

interface PurchaseOrderInfo {
  purchaseOrderId?: number
  purchaseOrderNumber?: string
  supplierOrderNumber?: string
  goodsOwnerReference?: string
  referenceNumber?: string
  purchaseOrderStatus?: PurchaseOrderStatus_
  inDate?: string
}

interface PurchaseOrderLine {
  id?: number
  rowNumber?: string | number
  article?: {
    articleSystemId?: number
    articleNumber?: string
    articleName?: string
    productCode?: string
  }
  comment?: string
  advisedNumberOfItems?: number
  receivedNumberOfItems?: number
  reportedNumberOfItems?: number | null
}

interface SupplierInfo {
  supplierNumber?: string
  supplierName?: string
}

export interface RawOngoingWmsPurchaseOrder {
  goodsOwner?: { id?: number; name?: string }
  supplierInfo?: SupplierInfo
  purchaseOrderInfo?: PurchaseOrderInfo
  purchaseOrderLines?: PurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(statusNumber: number | undefined): PurchaseOrderStatus {
  switch (statusNumber) {
    case 10: return 'draft'
    case 20: return 'sent'
    case 40: return 'partially_received'
    case 100: return 'received'
    case 900: return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawOngoingWmsPurchaseOrder): PurchaseOrder {
  const info = raw.purchaseOrderInfo ?? {}
  const id = String(info.purchaseOrderId ?? '')

  return {
    id,
    externalId: id,
    number: pickStr(info.purchaseOrderNumber),
    supplierId: pickStr(raw.supplierInfo?.supplierNumber) ?? '',
    destinationLocationId: undefined,
    status: mapStatus(info.purchaseOrderStatus?.number),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines: (raw.purchaseOrderLines ?? []).map((l) => ({
      productId: String(l.article?.articleSystemId ?? l.article?.articleNumber ?? ''),
      quantityOrdered: l.advisedNumberOfItems ?? 0,
      quantityReceived: l.receivedNumberOfItems,
      unitCost: undefined,
      lineTotal: undefined,
    })),
    expectedAt: toIso(info.inDate),
    orderedAt: undefined,
    receivedAt: undefined,
    platform: 'ongoing-wms',
    metadata: strMap({
      supplierOrderNumber: info.supplierOrderNumber,
      goodsOwnerReference: info.goodsOwnerReference,
      referenceNumber: info.referenceNumber,
      statusText: info.purchaseOrderStatus?.text,
      supplierName: raw.supplierInfo?.supplierName,
    }),
    raw,
  }
}
