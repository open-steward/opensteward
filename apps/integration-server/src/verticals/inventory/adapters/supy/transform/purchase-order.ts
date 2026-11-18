/**
 * Supy "purchase order" → canonical PurchaseOrder transform.
 *
 * Supy supports multi-branch purchase orders with per-item lines. Status values
 * follow a draft → pending_approval → approved → sent → partially_received →
 * received lifecycle. Amounts are stored as decimals in the platform currency
 * (schema amounts field is a plain number, not minor units).
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSupyPurchaseOrderLine {
  itemId: string
  itemName?: string
  quantity: number
  receivedQuantity?: number
  unitCost?: number
  totalCost?: number
  unitOfMeasure?: string
  [key: string]: unknown
}

export interface RawSupyPurchaseOrder {
  id: string
  orderNumber?: string
  supplierId?: string
  supplierName?: string
  branchId?: string
  status?: string
  currency?: string
  subtotal?: number
  total?: number
  lines?: RawSupyPurchaseOrderLine[]
  orderedAt?: string
  expectedDeliveryDate?: string
  receivedAt?: string
  notes?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'pending_approval':
    case 'pending': return 'draft'
    case 'approved':
    case 'sent':
    case 'submitted': return 'sent'
    case 'partially_received':
    case 'partial': return 'partially_received'
    case 'received':
    case 'fully_received': return 'received'
    case 'closed':
    case 'completed': return 'closed'
    case 'cancelled':
    case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSupyPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: pickStr(raw.orderNumber),
    supplierId: pickStr(raw.supplierId) ?? pickStr(raw.supplierName) ?? '',
    destinationLocationId: pickStr(raw.branchId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: pickNum(raw.subtotal),
    totalAmount: pickNum(raw.total),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      quantityOrdered: l.quantity,
      quantityReceived: l.receivedQuantity,
      unitCost: pickNum(l.unitCost),
      lineTotal: pickNum(l.totalCost),
    })),
    expectedAt: toIso(raw.expectedDeliveryDate),
    orderedAt: toIso(raw.orderedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'supy',
    metadata: strMap({
      supplierName: raw.supplierName,
      notes: raw.notes,
    }),
    raw,
  }
}
