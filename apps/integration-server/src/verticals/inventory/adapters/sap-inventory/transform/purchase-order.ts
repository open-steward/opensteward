/**
 * Transform SAP API_PURCHASEORDER_PROCESS_SRV A_PurchaseOrder → canonical PurchaseOrder.
 *
 * Header entity (A_PurchaseOrder) key fields:
 *   PurchaseOrder, Supplier, PurchaseOrderType, PurchasingOrganization,
 *   PurchasingGroup, DocumentCurrency, TotalNetOrderAmount,
 *   PurchaseOrderDate, CreationDate, CompanyCode, IncotermsLocation1,
 *   PaymentTerms
 *
 * Item entity (A_PurchaseOrderItem) key fields:
 *   PurchaseOrder, PurchaseOrderItem, Plant, StorageLocation, Material,
 *   PurchaseOrderItemText, OrderQuantity, PurchaseOrderQuantityUnit,
 *   NetPriceAmount, NetPriceQuantity, DocumentCurrency,
 *   GoodsReceiptQty, InvoiceReceiptQty, PurchaseOrderItemCategory
 *
 * Amounts stored as INTEGER MINOR UNITS (cents) where currency implies 2 d.p.
 * SAP returns amounts as decimal strings ("1234.56"); multiply × 100.
 *
 * Reference: https://api.sap.com/api/API_PURCHASEORDER_PROCESS_SRV/resource
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/** Raw SAP A_PurchaseOrderItem */
interface RawSapPOItem {
  PurchaseOrder?: string
  PurchaseOrderItem?: string
  Material?: string
  /** Storage location (plant + sloc) */
  Plant?: string
  StorageLocation?: string
  OrderQuantity?: string | number
  PurchaseOrderQuantityUnit?: string
  /** Unit price */
  NetPriceAmount?: string | number
  /** Denominator for NetPriceAmount (usually 1) */
  NetPriceQuantity?: string | number
  DocumentCurrency?: string
  /** Goods-received quantity */
  GoodsReceiptQty?: string | number
  [key: string]: unknown
}

/** Raw SAP A_PurchaseOrder header */
export interface RawSapPurchaseOrder {
  PurchaseOrder: string
  Supplier?: string
  /** NB (standard), ZNB (custom), UB (stock transfer), etc. */
  PurchaseOrderType?: string
  PurchasingOrganization?: string
  PurchasingGroup?: string
  CompanyCode?: string
  DocumentCurrency?: string
  TotalNetOrderAmount?: string | number
  PurchaseOrderDate?: string
  /** Creation date/time */
  CreationDate?: string
  /** Item list (expanded via $expand=to_PurchaseOrderItem) */
  to_PurchaseOrderItem?: { results?: RawSapPOItem[] } | RawSapPOItem[]
  [key: string]: unknown
}

/**
 * Map SAP PurchaseOrderType / lifecycle status.
 * SAP PO does not have a single Status field — status is derived from
 * goods-receipt and invoice-receipt flags.  We map PurchaseOrderType
 * as a proxy for common statuses when a formal status is unavailable.
 */
function mapStatus(raw: RawSapPurchaseOrder): PurchaseOrderStatus {
  const type = (raw.PurchaseOrderType ?? '').toUpperCase()
  // Stock-transfer orders are treated as sent
  if (type === 'UB') return 'sent'
  // Default to sent (document exists in SAP = already ordered)
  return 'sent'
}

/**
 * Convert SAP decimal-string amount to integer minor units (cents).
 * SAP: "1234.56" → 123456
 */
function toMinorUnits(v: string | number | undefined): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (n === undefined || Number.isNaN(n as number)) return undefined
  return Math.round((n as number) * 100)
}

function extractItems(raw: RawSapPurchaseOrder): RawSapPOItem[] {
  const nav = raw.to_PurchaseOrderItem
  if (!nav) return []
  if (Array.isArray(nav)) return nav
  return nav.results ?? []
}

export function transformPurchaseOrder(raw: RawSapPurchaseOrder): PurchaseOrder {
  const currency = pickStr(raw.DocumentCurrency)

  const lines = extractItems(raw).map((item) => {
    const qty = pickNum(item.OrderQuantity) ?? 0
    const received = pickNum(item.GoodsReceiptQty)
    const unitCostMinor = toMinorUnits(item.NetPriceAmount)
    const lineTotal = unitCostMinor !== undefined ? unitCostMinor * qty : undefined

    return {
      productId: pickStr(item.Material) ?? '',
      quantityOrdered: qty,
      quantityReceived: received,
      unitCost: unitCostMinor,
      lineTotal,
    }
  })

  return {
    id: raw.PurchaseOrder,
    externalId: raw.PurchaseOrder,
    number: pickStr(raw.PurchaseOrder),
    supplierId: pickStr(raw.Supplier) ?? '',
    destinationLocationId: undefined,
    status: mapStatus(raw),
    currency,
    subtotalAmount: toMinorUnits(raw.TotalNetOrderAmount),
    totalAmount: toMinorUnits(raw.TotalNetOrderAmount),
    lines,
    expectedAt: undefined,
    orderedAt: toIso(raw.PurchaseOrderDate) ?? toIso(raw.CreationDate),
    receivedAt: undefined,
    platform: 'sap-inventory',
    metadata: strMap({
      purchaseOrderType: raw.PurchaseOrderType,
      purchasingOrganization: raw.PurchasingOrganization,
      purchasingGroup: raw.PurchasingGroup,
      companyCode: raw.CompanyCode,
    }),
    raw,
  }
}
