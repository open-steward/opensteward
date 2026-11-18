/**
 * SAP EWM purchase-order transform.
 *
 * Source: SAP S/4HANA Warehouse Inbound Delivery OData v2 service.
 *   API name : WAREHOUSEINBOUNDDELIVERY_0001
 *   Entity sets:
 *     WhseInboundDeliveryHead   — header-level data
 *     WhseInboundDeliveryItem   — line-level data (navigate via to_WhseInbDeliveryItem)
 *
 * SAP EWM does not have a standalone "purchase order" endpoint in the warehouse
 * layer; inbound deliveries (which are the warehouse-visible face of POs) are
 * the closest equivalent.  We map WhseInboundDeliveryHead → PurchaseOrder.
 *
 * Key fields on WhseInboundDeliveryHead:
 *   InboundDelivery (= delivery document number, e.g. "0180000001")
 *
 * Status mapping (EWM overall processing status):
 *   A = not processed, B = partially processed, C = fully processed,
 *   ' ' = not relevant
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSapEwmInboundDeliveryItem {
  /** Delivery document number */
  InboundDelivery: string
  /** Delivery item number (zero-padded, e.g. "000010") */
  DeliveryDocumentItem: string
  /** Material number */
  Product?: string
  /** Delivery quantity */
  ActualDeliveryQuantity?: string | number
  /** Goods receipt quantity */
  OpenDeliveryQuantity?: string | number
  /** Delivery quantity unit */
  DeliveryQuantityUnit?: string
  /** Net amount (in document currency) — cents-like decimal string */
  NetAmount?: string | number
  /** Document currency */
  TransactionCurrency?: string
  [key: string]: unknown
}

export interface RawSapEwmInboundDelivery {
  /** Delivery document number (primary key) */
  InboundDelivery: string
  /** Supplying plant or external supplier number */
  Supplier?: string
  /** Receiving warehouse */
  WarehouseNumber?: string
  /** Receiving storage location (plant-level) */
  StorageLocation?: string
  /** Overall delivery status */
  OverallDeliveryStatus?: string
  /** Document date as /Date(ms)/ */
  DocumentDate?: string
  /** Planned delivery date */
  DeliveryDate?: string
  /** Actual goods receipt date */
  ActualGoodsMovementDate?: string
  /** Document currency */
  DocumentCurrency?: string
  /** Net value (header total) */
  NetValueOfOrderItem?: string | number
  /** Purchase order number this delivery is based on */
  PurchaseOrder?: string
  /** Expanded items (if $expand=to_WhseInbDeliveryItem) */
  to_WhseInbDeliveryItem?: { results?: RawSapEwmInboundDeliveryItem[] }
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch (s ?? '') {
    case 'A': return 'sent'        // not yet processed in warehouse
    case 'B': return 'partially_received'
    case 'C': return 'received'
    default:  return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSapEwmInboundDelivery): PurchaseOrder {
  const items = raw.to_WhseInbDeliveryItem?.results ?? []

  return {
    id: raw.InboundDelivery,
    externalId: raw.InboundDelivery,
    number: pickStr(raw.PurchaseOrder) ?? raw.InboundDelivery,
    supplierId: raw.Supplier ?? '',
    destinationLocationId: raw.WarehouseNumber
      ? raw.StorageLocation
        ? `${raw.WarehouseNumber}:${raw.StorageLocation}`
        : raw.WarehouseNumber
      : undefined,
    status: mapStatus(raw.OverallDeliveryStatus),
    currency: pickStr(raw.DocumentCurrency),
    subtotalAmount: pickNum(raw.NetValueOfOrderItem),
    totalAmount: pickNum(raw.NetValueOfOrderItem),
    lines: items.map((item) => ({
      productId: item.Product ?? '',
      quantityOrdered: pickNum(item.ActualDeliveryQuantity) ?? 0,
      quantityReceived: (() => {
        const ordered = pickNum(item.ActualDeliveryQuantity) ?? 0
        const open = pickNum(item.OpenDeliveryQuantity) ?? 0
        return ordered - open
      })(),
      unitCost: undefined,
      lineTotal: pickNum(item.NetAmount),
    })),
    expectedAt: toIso(raw.DeliveryDate),
    orderedAt: toIso(raw.DocumentDate),
    receivedAt: toIso(raw.ActualGoodsMovementDate),
    platform: 'sap-ewm',
    metadata: strMap({
      warehouseNumber: raw.WarehouseNumber,
      storageLocation: raw.StorageLocation,
      overallDeliveryStatus: raw.OverallDeliveryStatus,
    }),
    raw,
  }
}
