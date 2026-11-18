/**
 * MarketMan order → canonical PurchaseOrder.
 *
 * Response shape from POST /buyers/orders/GetOrdersBySentDate
 * Response key: "Orders"
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawMarketmanPurchaseOrder {
  OrderNumber?: string | null
  BuyerName?: string | null
  BuyerGuid?: string | null
  VendorName?: string | null
  VendorGuid?: string | null
  DeliveryDateUTC?: string | null
  SentDateUTC?: string | null
  PriceTotalWithoutVAT?: number | null
  PriceTotalWithVAT?: number | null
  Comments?: string | null
  OrderStatus?: string | null
  Items?: Array<{
    ItemName?: string | null
    SKU?: string | null
    Quantity?: number | null
    Price?: number | null
    PriceTotal?: number | null
    BarcodeManufacture?: string | null
    CatalogItemID?: number | null
    PackQuantity?: number | null
    PackPerCase?: number | null
  }> | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined | null): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'SENT': case 'ORDERED': case 'SUBMITTED': return 'sent'
    case 'PARTIALLY RECEIVED': case 'PARTIAL': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'COMPLETED': case 'CLOSED': case 'CONFIRMED': return 'closed'
    case 'CANCELLED': case 'VOIDED': case 'REJECTED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawMarketmanPurchaseOrder): PurchaseOrder {
  const id = pickStr(raw.OrderNumber) ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.OrderNumber),
    supplierId: pickStr(raw.VendorGuid) ?? pickStr(raw.VendorName) ?? '',
    destinationLocationId: pickStr(raw.BuyerGuid),
    status: mapStatus(raw.OrderStatus),
    currency: 'USD',
    subtotalAmount: raw.PriceTotalWithoutVAT ?? undefined,
    totalAmount: raw.PriceTotalWithVAT ?? raw.PriceTotalWithoutVAT ?? undefined,
    lines: (raw.Items ?? []).map((item) => ({
      productId: String(item.CatalogItemID ?? item.SKU ?? item.ItemName ?? ''),
      quantityOrdered: item.Quantity ?? 0,
      quantityReceived: undefined,
      unitCost: item.Price ?? undefined,
      lineTotal: item.PriceTotal ?? undefined,
    })),
    expectedAt: toIso(raw.DeliveryDateUTC),
    orderedAt: toIso(raw.SentDateUTC),
    receivedAt: undefined,
    platform: 'marketman',
    metadata: strMap({
      buyerGuid: raw.BuyerGuid,
      vendorName: raw.VendorName,
      buyerName: raw.BuyerName,
      comments: raw.Comments,
    }),
    raw,
  }
}
