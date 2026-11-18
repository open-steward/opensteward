/**
 * Transform a Datapel Breeze inward-order (purchase order) record into the
 * canonical PurchaseOrder shape.
 *
 * Datapel's API surfaces purchase orders as "Inward Orders" via the
 * /inwardorderlist endpoint. Field names follow the ccBreezeSDK patterns
 * (lowercase snake-style) observed in the C# domain models.
 *
 * Status values observed:
 *   'Open', 'Draft', 'Pending', 'Ordered', 'Received', 'Partial', 'Closed',
 *   'Cancelled', 'Voided'
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawDatapelInwardOrder {
  inwardorderid?: number | string
  ordernumber?: string
  supplierid?: number | string
  suppliername?: string
  status?: string
  locationid?: number | string
  subtotal?: number | string
  total?: number | string
  currency?: string
  orderdate?: string
  expecteddate?: string
  receiveddate?: string
  completeddate?: string
  lines?: Array<{
    basestockid?: number | string
    itemcode?: string
    orderedqty?: number | string
    receivedqty?: number | string
    unitcost?: number | string
    linetotal?: number | string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
    case 'pending':
      return 'draft'
    case 'open':
    case 'ordered':
    case 'authorised':
    case 'authorised - credit hold':
      return 'sent'
    case 'partial':
    case 'partially received':
      return 'partially_received'
    case 'received':
      return 'received'
    case 'completed':
    case 'closed':
      return 'closed'
    case 'voided':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'draft'
  }
}

function toAmountMinor(v: unknown): number | undefined {
  const n = pickNum(v)
  return n !== undefined ? Math.round(n * 100) : undefined
}

export function transformPurchaseOrder(raw: RawDatapelInwardOrder): PurchaseOrder {
  const id = String(raw.inwardorderid ?? '')
  return {
    id,
    externalId: id,
    number: pickStr(raw.ordernumber),
    supplierId: String(raw.supplierid ?? ''),
    destinationLocationId: raw.locationid !== undefined ? String(raw.locationid) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: toAmountMinor(raw.subtotal),
    totalAmount: toAmountMinor(raw.total),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.basestockid ?? ''),
      quantityOrdered: pickNum(l.orderedqty) ?? 0,
      quantityReceived: pickNum(l.receivedqty),
      unitCost: toAmountMinor(l.unitcost),
      lineTotal: toAmountMinor(l.linetotal),
    })),
    expectedAt: toIso(raw.expecteddate),
    orderedAt: toIso(raw.orderdate),
    receivedAt: toIso(raw.receiveddate) ?? toIso(raw.completeddate),
    platform: 'datapel',
    metadata: strMap({ suppliername: raw.suppliername, status: raw.status }),
    raw,
  }
}
