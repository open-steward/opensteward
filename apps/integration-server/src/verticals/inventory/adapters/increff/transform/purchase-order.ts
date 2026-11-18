/**
 * Increff inward / purchase order (GRN) transform.
 *
 * Increff calls these "inward orders" — purchase orders raised in an ERP
 * and pushed to Increff, or created directly in the OMS. Key fields:
 *   inwardOrderCode  — unique order code (the external ID)
 *   supplierCode     — supplier reference
 *   warehouseCode    — destination warehouse
 *   status           — CREATED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED
 *   items            — line items with skuCode, orderedQty, receivedQty, unitCost
 *   expectedDate     — expected delivery date (ISO string)
 *   orderedOn        — order creation date
 *   completedOn      — date all items received
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawIncreffPurchaseOrder {
  inwardOrderCode: string
  supplierCode?: string
  warehouseCode?: string
  status?: string
  currency?: string
  totalAmount?: number
  items?: Array<{
    skuCode: string
    orderedQty: number
    receivedQty?: number
    unitCost?: number
    lineTotal?: number
  }>
  expectedDate?: string
  orderedOn?: string
  completedOn?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'CREATED': case 'DRAFT': return 'draft'
    case 'SENT': case 'APPROVED': return 'sent'
    case 'PARTIALLY_RECEIVED': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'COMPLETED': case 'CLOSED': return 'closed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawIncreffPurchaseOrder): PurchaseOrder {
  return {
    id: raw.inwardOrderCode,
    externalId: raw.inwardOrderCode,
    number: pickStr(raw.inwardOrderCode),
    supplierId: raw.supplierCode ?? '',
    destinationLocationId: pickStr(raw.warehouseCode),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    totalAmount: raw.totalAmount,
    lines: (raw.items ?? []).map((l) => ({
      productId: l.skuCode,
      quantityOrdered: l.orderedQty,
      quantityReceived: l.receivedQty,
      unitCost: l.unitCost,
      lineTotal: l.lineTotal,
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: toIso(raw.orderedOn),
    receivedAt: toIso(raw.completedOn),
    platform: 'increff',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
