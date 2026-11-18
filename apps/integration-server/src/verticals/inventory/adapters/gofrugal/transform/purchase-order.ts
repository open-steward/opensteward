/**
 * GoFrugal RetailEasy purchase-order transform.
 *
 * GoFrugal's public WebReporter API (api/v1) does not expose a purchase-order
 * listing endpoint. This file is a placeholder for future use. The adapter
 * does NOT implement listPurchaseOrders / getPurchaseOrder.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawGofrugalPurchaseOrder {
  purchaseOrderId: number | string
  orderNumber?: string
  supplierId?: number | string
  supplierName?: string
  status?: string
  currency?: string
  totalAmount?: number
  locationId?: number | string
  lines?: Array<{
    itemId: number | string
    quantity: number
    receivedQty?: number
    unitPrice?: number
    lineTotal?: number
  }>
  orderDate?: string
  expectedDate?: string
  receivedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'ORDERED': case 'APPROVED': return 'sent'
    case 'PARTIAL': case 'PARTIALLY RECEIVED': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'COMPLETED': case 'CLOSED': return 'closed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawGofrugalPurchaseOrder): PurchaseOrder {
  const id = String(raw.purchaseOrderId)
  return {
    id,
    externalId: id,
    number: pickStr(raw.orderNumber),
    supplierId: raw.supplierId != null ? String(raw.supplierId) : (pickStr(raw.supplierName) ?? ''),
    destinationLocationId: raw.locationId != null ? String(raw.locationId) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency) ?? 'INR',
    subtotalAmount: undefined,
    // Amounts stored as INTEGER MINOR UNITS (paise for INR)
    totalAmount: raw.totalAmount !== undefined ? Math.round(raw.totalAmount * 100) : undefined,
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      quantityOrdered: l.quantity,
      quantityReceived: l.receivedQty,
      unitCost: l.unitPrice !== undefined ? Math.round(l.unitPrice * 100) : undefined,
      lineTotal: l.lineTotal !== undefined ? Math.round(l.lineTotal * 100) : undefined,
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: toIso(raw.orderDate),
    receivedAt: toIso(raw.receivedDate),
    platform: 'gofrugal',
    metadata: strMap({ rawStatus: raw.status }),
    raw,
  }
}
