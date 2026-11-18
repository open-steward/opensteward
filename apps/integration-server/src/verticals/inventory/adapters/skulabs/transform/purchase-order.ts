import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSkulabsPurchaseOrder {
  _id: string
  number?: string
  distributor_id?: string
  status?: string
  currency?: string
  subtotal?: number
  total?: number
  tax?: number
  shipping?: number
  discount?: number
  warehouse_id?: string
  items?: Array<{
    item_id?: string
    kit_id?: string
    sku?: string
    name?: string
    quantity?: number
    received?: number
    cost?: number
    rate?: number
    type?: string
    description?: string
    unit?: string
  }>
  due_date?: string | null
  arrival_date?: string | null
  closed_date?: string | null
  memo?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created': return 'draft'
    case 'sent': case 'acknowledged': case 'edited': return 'sent'
    case 'receiving': case 'accepting': return 'partially_received'
    case 'transit': return 'sent'
    case 'closed': return 'closed'
    default: return 'draft'
  }
}

function toMinorUnits(v: number | undefined): number | undefined {
  if (v === undefined) return undefined
  return Math.round(v * 100)
}

export function transformPurchaseOrder(raw: RawSkulabsPurchaseOrder): PurchaseOrder {
  return {
    id: raw._id,
    externalId: raw._id,
    number: pickStr(raw.number),
    supplierId: raw.distributor_id ?? '',
    destinationLocationId: pickStr(raw.warehouse_id),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: toMinorUnits(raw.subtotal),
    totalAmount: toMinorUnits(raw.total),
    lines: (raw.items ?? []).map((l) => ({
      productId: l.item_id ?? l.kit_id ?? '',
      quantityOrdered: l.quantity ?? 0,
      quantityReceived: l.received,
      unitCost: toMinorUnits(l.cost),
      lineTotal: l.rate !== undefined && l.quantity !== undefined
        ? Math.round(l.rate * l.quantity * 100)
        : undefined,
    })),
    expectedAt: toIso(raw.arrival_date ?? raw.due_date),
    receivedAt: toIso(raw.closed_date),
    platform: 'skulabs',
    metadata: strMap({ memo: raw.memo, rawStatus: raw.status }),
    raw,
  }
}
