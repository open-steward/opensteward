/**
 * AdvancePro purchase order transform.
 *
 * GET /api/PurchaseOrders returns purchase order records.
 *
 * Known response fields:
 *   id, orderNumber, vendorId, vendorName, status, currency,
 *   subtotal, total, warehouseId,
 *   lines[]: { productId, productSku, quantity, received, unitCost, lineTotal }
 *   expectedDate, orderDate, receivedDate, createdDate, modifiedDate
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawAdvanceProPurchaseOrderLine {
  productId?: string | number
  productSku?: string
  quantity?: number | string
  received?: number | string
  unitCost?: number | string
  price?: number | string
  lineTotal?: number | string
  total?: number | string
}

export interface RawAdvanceProPurchaseOrder {
  id?: string | number
  orderNumber?: string
  number?: string
  vendorId?: string | number
  vendorName?: string
  status?: string
  currency?: string
  subtotal?: number | string
  total?: number | string
  warehouseId?: string | number
  lines?: RawAdvanceProPurchaseOrderLine[]
  items?: RawAdvanceProPurchaseOrderLine[]
  expectedDate?: string
  expectedDeliveryDate?: string
  orderDate?: string
  receivedDate?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'NEW': return 'draft'
    case 'SENT': case 'ORDERED': case 'OPEN': return 'sent'
    case 'PARTIAL': case 'PARTIALLY RECEIVED': return 'partially_received'
    case 'RECEIVED': case 'FULLY RECEIVED': return 'received'
    case 'CLOSED': case 'COMPLETED': return 'closed'
    case 'VOID': case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawAdvanceProPurchaseOrder): PurchaseOrder {
  const externalId = String(raw.id ?? '')
  const rawLines = raw.lines ?? raw.items ?? []

  // Unit costs and totals are dollar floats — convert to integer minor units (cents)
  const subtotalDollars = pickNum(raw.subtotal)
  const totalDollars = pickNum(raw.total)

  return {
    id: externalId,
    externalId,
    number: pickStr(raw.orderNumber ?? raw.number),
    supplierId: String(raw.vendorId ?? ''),
    destinationLocationId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: subtotalDollars !== undefined ? Math.round(subtotalDollars * 100) : undefined,
    totalAmount: totalDollars !== undefined ? Math.round(totalDollars * 100) : undefined,
    lines: rawLines.map((l) => {
      const unitCostDollars = pickNum(l.unitCost ?? l.price)
      const lineTotalDollars = pickNum(l.lineTotal ?? l.total)
      return {
        productId: String(l.productId ?? ''),
        quantityOrdered: pickNum(l.quantity) ?? 0,
        quantityReceived: pickNum(l.received),
        unitCost: unitCostDollars !== undefined ? Math.round(unitCostDollars * 100) : undefined,
        lineTotal: lineTotalDollars !== undefined ? Math.round(lineTotalDollars * 100) : undefined,
      }
    }),
    expectedAt: toIso(raw.expectedDate ?? raw.expectedDeliveryDate),
    orderedAt: toIso(raw.orderDate ?? raw.createdDate),
    receivedAt: toIso(raw.receivedDate),
    platform: 'advance-pro',
    metadata: strMap({ vendorName: raw.vendorName }),
    raw,
  }
}
