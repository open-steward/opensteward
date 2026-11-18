/**
 * Transform SAP stock-transfer order → canonical StockTransfer.
 *
 * SAP models intra-company stock transfers two ways:
 *   a) Purchase Order type "UB" (stock transport order) via
 *      API_PURCHASEORDER_PROCESS_SRV A_PurchaseOrder
 *   b) Transfer Order (warehouse management) via
 *      API_WHSE_MGMT_WAREHOUSING_SRV (extended WM)
 *
 * This adapter maps the simpler PO type-UB shape.
 *
 * Key header fields:
 *   PurchaseOrder, Supplier (sending plant as vendor), PurchasingOrganization,
 *   DocumentCurrency, TotalNetOrderAmount, PurchaseOrderDate
 *
 * Key item fields: same as A_PurchaseOrderItem with ReceivingPlant, Plant
 *   (ReceivingPlant = destination, Plant = source on UB lines).
 *
 * Reference: https://api.sap.com/api/API_PURCHASEORDER_PROCESS_SRV/resource
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

interface RawSapSTOItem {
  PurchaseOrderItem?: string
  Material?: string
  /** Source plant */
  Plant?: string
  StorageLocation?: string
  /** Destination plant (UB-specific field) */
  ReceivingPlant?: string
  OrderQuantity?: string | number
  PurchaseOrderQuantityUnit?: string
  /** Goods-received quantity at destination */
  GoodsReceiptQty?: string | number
  [key: string]: unknown
}

/** Raw stock transport order — PurchaseOrderType = "UB" */
export interface RawSapStockTransfer {
  PurchaseOrder: string
  /** PurchaseOrderType should be "UB" for stock transfers */
  PurchaseOrderType?: string
  Supplier?: string
  PurchasingOrganization?: string
  DocumentCurrency?: string
  TotalNetOrderAmount?: string | number
  PurchaseOrderDate?: string
  CreationDate?: string
  /** Expanded item list */
  to_PurchaseOrderItem?: { results?: RawSapSTOItem[] } | RawSapSTOItem[]
  /** Overall delivery status (populated by $expand=to_PurchaseOrderStatus) */
  DeliveryDocumentStatus?: string
  [key: string]: unknown
}

/**
 * SAP stock transport orders do not have a single lifecycle status field on
 * the header.  We infer from available signals:
 *   - If goods receipt qty = 0 on all items → draft or in_transit
 *   - If goods receipt qty = order qty on all items → completed
 *   - Partial goods receipt → in_transit
 */
function mapStatus(items: RawSapSTOItem[]): StockTransferStatus {
  if (items.length === 0) return 'draft'
  const totalOrdered = items.reduce((s, i) => s + (pickNum(i.OrderQuantity) ?? 0), 0)
  const totalReceived = items.reduce((s, i) => s + (pickNum(i.GoodsReceiptQty) ?? 0), 0)
  if (totalReceived <= 0) return 'draft'
  if (totalReceived >= totalOrdered) return 'completed'
  return 'in_transit'
}

function extractItems(raw: RawSapStockTransfer): RawSapSTOItem[] {
  const nav = raw.to_PurchaseOrderItem
  if (!nav) return []
  if (Array.isArray(nav)) return nav
  return nav.results ?? []
}

export function transformStockTransfer(raw: RawSapStockTransfer): StockTransfer {
  const items = extractItems(raw)

  // Source location: Plant of first item
  const firstItem = items[0]
  const sourcePlant = pickStr(firstItem?.Plant) ?? ''
  const sourceSloc = pickStr(firstItem?.StorageLocation) ?? ''
  const fromLocationId = sourceSloc ? `${sourcePlant}:${sourceSloc}` : sourcePlant

  // Destination location: ReceivingPlant of first item
  const destPlant = pickStr(firstItem?.ReceivingPlant) ?? pickStr(raw.Supplier) ?? ''
  const toLocationId = destPlant

  const lines = items.map((item) => ({
    productId: pickStr(item.Material) ?? '',
    quantity: pickNum(item.OrderQuantity) ?? 0,
    quantityReceived: pickNum(item.GoodsReceiptQty),
  }))

  return {
    id: raw.PurchaseOrder,
    externalId: raw.PurchaseOrder,
    number: pickStr(raw.PurchaseOrder),
    fromLocationId,
    toLocationId,
    status: mapStatus(items),
    lines,
    shippedAt: toIso(raw.PurchaseOrderDate) ?? toIso(raw.CreationDate),
    receivedAt: undefined,
    platform: 'sap-inventory',
    metadata: strMap({
      purchaseOrderType: raw.PurchaseOrderType,
      purchasingOrganization: raw.PurchasingOrganization,
      documentCurrency: raw.DocumentCurrency,
    }),
    raw,
  }
}
