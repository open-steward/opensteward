/**
 * EZO purchase order transform.
 *
 * List endpoint: GET /api/v2/purchase_orders  → { purchase_orders: [...], metadata: { next_page } }
 * Single:        GET /api/v2/purchase_orders/:id → { purchase_order: {...} }
 *
 * Key EZO response fields:
 *   id, identification_number, vendor_id (vendor name may also appear),
 *   delivery_location_id, status ("draft" | "confirmed" | "received" | "void"),
 *   description, shipment_terms, payment_terms,
 *   created_at, updated_at
 *   line_items: [ { id, item_type, item_id, quantity, unit_price, total } ]
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawEZOPurchaseOrderLine {
  id?: number | string
  item_type?: string
  item_id?: number | string
  quantity?: number | string
  unit_price?: number | string
  total?: number | string
  [key: string]: unknown
}

export interface RawEZOPurchaseOrder {
  id: number | string
  identification_number?: string
  vendor_id?: number | string
  delivery_location_id?: number | string
  /** EZO v2 uses "state" (not "status") for PO lifecycle */
  state?: string
  description?: string
  title?: string
  notes?: string
  shipment_terms?: string
  payment_terms?: string
  /** net_amount and payable_amount are the PO totals */
  net_amount?: number | string
  payable_amount?: number | string
  line_items?: RawEZOPurchaseOrderLine[]
  created_at?: string
  updated_at?: string
  confirmed_at?: string
  completed_on?: string
  delivery_date?: string
  [key: string]: unknown
}

function mapStatus(state: string | undefined): PurchaseOrderStatus {
  // EZO v2 PO states (from data model): draft, requested, approved, confirmed,
  // partially_received, received/completed, closed, voided/cancelled
  switch ((state ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'requested': return 'draft'
    case 'approved': return 'draft'
    case 'confirmed': return 'sent'
    case 'partially_received': case 'partially received': case 'partial': return 'partially_received'
    case 'received': case 'completed': return 'received'
    case 'closed': return 'closed'
    case 'voided': case 'void': case 'cancelled': case 'canceled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawEZOPurchaseOrder): PurchaseOrder {
  const idStr = String(raw.id)

  const lines = (raw.line_items ?? []).map((l) => {
    const qty = l.quantity !== undefined ? Number(l.quantity) : 0
    const unitCostMinor = l.unit_price !== undefined ? Math.round(Number(l.unit_price) * 100) : undefined
    const lineTotalMinor = l.total !== undefined ? Math.round(Number(l.total) * 100) : undefined
    return {
      productId: String(l.item_id ?? ''),
      quantityOrdered: isNaN(qty) ? 0 : qty,
      quantityReceived: undefined,
      unitCost: unitCostMinor,
      lineTotal: lineTotalMinor,
    }
  })

  // EZO amounts are decimal strings; convert to integer minor units (cents)
  const netMinor = raw.net_amount !== undefined ? Math.round(Number(raw.net_amount) * 100) : undefined
  const totalMinor = raw.payable_amount !== undefined ? Math.round(Number(raw.payable_amount) * 100) : undefined

  return {
    id: idStr,
    externalId: idStr,
    number: pickStr(raw.identification_number),
    supplierId: raw.vendor_id != null ? String(raw.vendor_id) : '',
    destinationLocationId: raw.delivery_location_id != null ? String(raw.delivery_location_id) : undefined,
    status: mapStatus(raw.state),
    currency: undefined,
    subtotalAmount: netMinor,
    totalAmount: totalMinor,
    lines,
    expectedAt: toIso(raw.delivery_date),
    orderedAt: toIso(raw.confirmed_at) ?? toIso(raw.created_at),
    receivedAt: toIso(raw.completed_on),
    platform: 'ezofficeinventory',
    metadata: strMap({
      shipmentTerms: raw.shipment_terms,
      paymentTerms: raw.payment_terms,
      description: raw.description,
      notes: raw.notes,
      state: raw.state,
    }),
    raw,
  }
}
