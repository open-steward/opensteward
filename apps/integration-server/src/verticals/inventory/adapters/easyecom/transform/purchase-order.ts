import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * EasyEcom GRN / Purchase Order record.
 * Fields sourced from EasyEcom API /purchase/getPurchaseOrders response.
 */
export interface RawEasyEcomPurchaseOrder {
  purchase_order_id: string | number
  po_number?: string
  vendor_id?: string | number
  vendor_name?: string
  status?: string
  currency?: string
  total_amount?: number | string
  sub_total?: number | string
  warehouse_id?: string | number
  items?: Array<{
    sku?: string
    product_id?: string | number
    qty_ordered?: number | string
    qty_received?: number | string
    unit_price?: number | string
    total_price?: number | string
  }>
  order_date?: string
  expected_delivery_date?: string
  received_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  const up = (s ?? '').toUpperCase()
  if (up === 'DRAFT' || up === 'PENDING') return 'draft'
  if (up === 'ORDERED' || up === 'SENT' || up === 'CONFIRMED') return 'sent'
  if (up === 'PARTIALLY RECEIVED' || up === 'PARTIAL') return 'partially_received'
  if (up === 'RECEIVED' || up === 'FULLY RECEIVED') return 'received'
  if (up === 'COMPLETED' || up === 'CLOSED') return 'closed'
  if (up === 'CANCELLED' || up === 'VOIDED') return 'cancelled'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawEasyEcomPurchaseOrder): PurchaseOrder {
  const id = String(raw.purchase_order_id)
  const totalAmount = pickNum(raw.total_amount)
  const subTotal = pickNum(raw.sub_total)

  return {
    id,
    externalId: id,
    number: pickStr(raw.po_number),
    supplierId: raw.vendor_id != null ? String(raw.vendor_id) : (pickStr(raw.vendor_name) ?? ''),
    destinationLocationId: raw.warehouse_id != null ? String(raw.warehouse_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: subTotal !== undefined ? Math.round(subTotal * 100) : undefined,
    totalAmount: totalAmount !== undefined ? Math.round(totalAmount * 100) : undefined,
    lines: (raw.items ?? []).map((l) => {
      const productId = l.product_id != null ? String(l.product_id) : (l.sku ?? '')
      const unitCost = pickNum(l.unit_price)
      const lineTotal = pickNum(l.total_price)
      return {
        productId,
        quantityOrdered: pickNum(l.qty_ordered) ?? 0,
        quantityReceived: pickNum(l.qty_received),
        unitCost: unitCost !== undefined ? Math.round(unitCost * 100) : undefined,
        lineTotal: lineTotal !== undefined ? Math.round(lineTotal * 100) : undefined,
      }
    }),
    expectedAt: toIso(raw.expected_delivery_date),
    orderedAt: toIso(raw.order_date),
    receivedAt: toIso(raw.received_date),
    platform: 'easyecom',
    metadata: strMap({ vendorName: raw.vendor_name }),
    raw,
  }
}
