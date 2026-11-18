/**
 * Transform a Vend POS (Lightspeed Retail X-Series) consignment (stock order)
 * into the OpenSteward canonical PurchaseOrder schema.
 *
 * Vend models purchase orders as "consignments" with type = "SUPPLIER".
 * API reference: GET /api/2.0/consignments
 *
 * Key fields from the Vend data model:
 *   id, name, supplier_id, outlet_id, status, type, due_at,
 *   consignment_date, received_at, supplier_invoice, reference,
 *   total_count_gain, total_cost_gain
 *
 * Line items are fetched via:
 *   GET /api/2.0/consignments/{id}/products
 *   → { id, product_id, sku, count (ordered), received, cost (unit cost decimal) }
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso, toMinorUnits} from './shared'

export interface RawVendConsignmentProduct {
  id?: string
  product_id: string
  sku?: string
  /** Quantity ordered */
  count?: number
  received?: number
  /** Unit cost (decimal) */
  cost?: number | string
  [key: string]: unknown
}

export interface RawVendConsignment {
  /** UUID */
  id: string
  name?: string
  /** UUID of supplier */
  supplier_id?: string
  /** UUID of destination outlet */
  outlet_id?: string
  /** UUID of source outlet (for transfers) */
  source_outlet_id?: string
  /** OPEN | SENT | RECEIVED | CANCELLED */
  status?: string
  /** SUPPLIER = purchase order; OUTLET = stock transfer */
  type?: string
  due_at?: string
  consignment_date?: string
  received_at?: string
  supplier_invoice?: string
  reference?: string
  /** Line items (populated by calling listConsignmentProducts) */
  consignment_products?: RawVendConsignmentProduct[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN':
    case 'DRAFT':
      return 'draft'
    case 'SENT':
    case 'ORDERED':
      return 'sent'
    case 'RECEIVED':
      return 'received'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawVendConsignment): PurchaseOrder {
  const lines = (raw.consignment_products ?? []).map((l) => ({
    productId: l.product_id,
    quantityOrdered: l.count ?? 0,
    quantityReceived: l.received,
    // Amounts in integer minor units
    unitCost: toMinorUnits(l.cost),
  }))

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.reference) ?? pickStr(raw.name),
    supplierId: raw.supplier_id ?? '',
    destinationLocationId: pickStr(raw.outlet_id),
    status: mapStatus(raw.status),
    lines,
    expectedAt: toIso(raw.due_at),
    orderedAt: toIso(raw.consignment_date),
    receivedAt: toIso(raw.received_at),
    platform: 'vend-pos',
    metadata: strMap({
      supplierInvoice: raw.supplier_invoice,
      type: raw.type,
    }),
    raw,
  }
}
