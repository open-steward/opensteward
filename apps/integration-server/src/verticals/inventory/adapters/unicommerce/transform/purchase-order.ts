/**
 * Transform Unicommerce purchase order → canonical PurchaseOrder.
 *
 * Source endpoints:
 *   POST /services/rest/v1/purchase/purchaseOrder/getPurchaseOrders       → purchaseOrderCodes[]
 *   POST /services/rest/v1/purchase/purchaseOrder/getPurchaseOrderDetails → full PO object
 *
 * getPurchaseOrders returns only codes; the adapter fetches details per code.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawUnicommercePurchaseOrderItem {
  id?: number
  itemSKU?: string
  itemTypeName?: string
  quantity?: number
  pendingQuantity?: number
  rejectedQuantity?: number
  unitPrice?: number
  maxRetailPrice?: number
  subtotal?: number
  total?: number
  taxPercentage?: number
  tax?: number
  [key: string]: unknown
}

export interface RawUnicommercePurchaseOrder {
  id?: number
  code?: string
  type?: string
  statusCode?: string
  vendorCode?: string
  vendorId?: number
  vendorName?: string
  fromParty?: string
  created?: number | string
  expiryDate?: string
  deliveryDate?: string
  purchaseOrderItems?: RawUnicommercePurchaseOrderItem[]
  purchaseOrderPriceSummary?: {
    totalAmount?: number
    subTotalBeforeTaxesAndDiscount?: number
    discount?: number
    taxOnSales?: number
    logisticCharges?: number
  }
  customFieldValues?: Array<{ fieldName?: string; fieldValue?: unknown }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'CREATED': return 'draft'
    case 'APPROVED': case 'ORDERED': return 'sent'
    case 'PARTIALLY_RECEIVED': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'CLOSED': case 'COMPLETED': return 'closed'
    case 'CANCELLED': case 'REJECTED': return 'cancelled'
    default: return 'draft'
  }
}

function extractCurrency(raw: RawUnicommercePurchaseOrder): string | undefined {
  const cf = raw.customFieldValues?.find(
    (f) => (f.fieldName ?? '').toLowerCase() === 'currency',
  )
  if (cf?.fieldValue && typeof cf.fieldValue === 'string') return cf.fieldValue
  return undefined
}

export function transformPurchaseOrder(raw: RawUnicommercePurchaseOrder): PurchaseOrder {
  const id = pickStr(raw.code) ?? String(raw.id ?? '')
  const summary = raw.purchaseOrderPriceSummary

  return {
    id,
    externalId: id,
    number: pickStr(raw.code),
    supplierId: pickStr(raw.vendorCode) ?? pickStr(raw.vendorName) ?? '',
    status: mapStatus(raw.statusCode),
    currency: extractCurrency(raw),
    subtotalAmount: summary?.subTotalBeforeTaxesAndDiscount,
    totalAmount: summary?.totalAmount,
    lines: (raw.purchaseOrderItems ?? []).map((l) => ({
      productId: pickStr(l.itemSKU) ?? '',
      quantityOrdered: l.quantity ?? 0,
      quantityReceived:
        l.quantity !== undefined && l.pendingQuantity !== undefined
          ? l.quantity - l.pendingQuantity - (l.rejectedQuantity ?? 0)
          : undefined,
      unitCost: l.unitPrice,
      lineTotal: l.total,
    })),
    expectedAt: toIso(raw.deliveryDate),
    orderedAt: toIso(raw.created),
    platform: 'unicommerce',
    metadata: strMap({
      type: raw.type,
      fromParty: raw.fromParty,
      vendorName: raw.vendorName,
      expiryDate: raw.expiryDate,
    }),
    raw,
  }
}
