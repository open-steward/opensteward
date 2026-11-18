import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso, m2oId, m2oName} from './shared'

/**
 * Fulfil purchase.purchase (Purchase Order) record.
 *
 * Lines are read as a separate purchase.line request and joined by purchase id.
 * When lines are included inline, they appear under the `lines` key as an array of ids or objects.
 */
export interface RawFulfilPurchaseLine {
  id: number
  purchase?: [number, string] | null
  product?: [number, string] | null
  quantity?: number | null
  received_quantity?: number | null
  unit_price?: number | null
  amount?: number | null
  [key: string]: unknown
}

export interface RawFulfilPurchaseOrder {
  /** Integer record id */
  id: number
  /** PO number */
  number?: string | null
  /** Supplier party (Many2One) */
  party?: [number, string] | null
  /** State: draft | quotation | confirmed | processing | done | cancelled */
  state?: string | null
  /** Purchase currency (Many2One) */
  currency?: [number, string] | null
  /** Total amount (untaxed) */
  untaxed_amount?: number | null
  /** Total amount (with tax) */
  tax_amount?: number | null
  /** Total amount including tax */
  total_amount?: number | null
  /** Default warehouse location (Many2One) */
  warehouse?: [number, string] | null
  /** Ordered lines (array of line ids) */
  lines?: number[] | RawFulfilPurchaseLine[]
  /** Order date */
  purchase_date?: string | null
  /** Expected delivery date */
  delivery_date?: string | null
  /** Confirmed date */
  confirmed_date?: string | null
  create_date?: string | null
  write_date?: string | null
  [key: string]: unknown
}

/** Fields to request from the API for purchase.purchase. */
export const PURCHASE_FIELDS = [
  'id', 'number', 'party', 'state', 'currency', 'untaxed_amount', 'tax_amount',
  'total_amount', 'warehouse', 'lines', 'purchase_date', 'delivery_date',
  'confirmed_date', 'create_date', 'write_date',
]

function mapStatus(s: string | null | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'quotation': return 'draft'
    case 'confirmed': case 'processing': return 'sent'
    case 'done': return 'closed'
    case 'cancelled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(
  raw: RawFulfilPurchaseOrder,
  lines?: RawFulfilPurchaseLine[],
): PurchaseOrder {
  const id = String(raw.id)

  const resolvedLines = lines ?? (
    Array.isArray(raw.lines) && raw.lines.length > 0 && typeof raw.lines[0] === 'object'
      ? (raw.lines as RawFulfilPurchaseLine[])
      : []
  )

  return {
    id,
    externalId: id,
    number: pickStr(raw.number ?? undefined),
    supplierId: m2oId(raw.party) ?? '',
    destinationLocationId: m2oId(raw.warehouse),
    status: mapStatus(raw.state),
    currency: m2oName(raw.currency) ?? undefined,
    subtotalAmount: pickNum(raw.untaxed_amount),
    totalAmount: pickNum(raw.total_amount),
    lines: resolvedLines.map((l) => ({
      productId: m2oId(l.product) ?? '',
      quantityOrdered: l.quantity ?? 0,
      quantityReceived: l.received_quantity ?? undefined,
      unitCost: pickNum(l.unit_price),
      lineTotal: pickNum(l.amount),
    })),
    expectedAt: toIso(raw.delivery_date),
    orderedAt: toIso(raw.purchase_date),
    receivedAt: toIso(raw.confirmed_date),
    platform: 'fulfil-io',
    metadata: strMap({
      supplierName: m2oName(raw.party),
      warehouseName: m2oName(raw.warehouse),
    }),
    raw,
  }
}
