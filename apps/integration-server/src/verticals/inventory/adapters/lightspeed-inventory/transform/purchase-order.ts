/**
 * Lightspeed Retail (X-Series) consignment (purchase order / stock order) transform.
 *
 * X-Series uses "consignments" for all stock movements. Type=SUPPLIER represents
 * a purchase order. Type=OUTLET represents an inter-store transfer (handled in
 * stock-transfer.ts). Type=STOCKTAKE is an inventory count.
 *
 * API endpoint: GET /api/2.0/consignments?type=SUPPLIER
 * Docs: https://x-series-api.lightspeedhq.com/docs/inventory_creating_stock_orders
 *
 * Key fields:
 *   id              — UUID
 *   name            — reference name / PO number
 *   type            — SUPPLIER | OUTLET | RETURN | STOCKTAKE
 *   status          — OPEN | SENT | RECEIVED | CANCELLED
 *   supplier_id     — UUID of the supplier
 *   outlet_id       — destination outlet UUID
 *   due_at          — expected delivery date (ISO)
 *   sent_at         — date sent to supplier (ISO)
 *   received_at     — date goods received (ISO)
 *   consignment_date — general consignment date (ISO)
 *   total_cost_gain  — total cost variance
 *   products        — array of consignment product lines
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso, toMinorUnits} from './shared'

export interface RawLightspeedConsignmentLine {
  product_id: string
  count?: number | string
  received?: number | string
  cost?: number | string
  [key: string]: unknown
}

export interface RawLightspeedConsignment {
  id: string
  name?: string
  type?: string
  status?: string
  supplier_id?: string
  outlet_id?: string
  source_outlet_id?: string
  due_at?: string
  sent_at?: string
  received_at?: string
  consignment_date?: string
  supplier_invoice?: string
  reference?: string
  total_cost_gain?: number | string
  products?: RawLightspeedConsignmentLine[]
  deleted_at?: string | null
  version?: number
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN': return 'draft'
    case 'SENT': return 'sent'
    case 'RECEIVED': return 'received'
    case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawLightspeedConsignment): PurchaseOrder {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.name ?? raw.reference ?? raw.supplier_invoice),
    supplierId: raw.supplier_id ?? '',
    destinationLocationId: pickStr(raw.outlet_id),
    status: mapStatus(raw.status),
    currency: undefined, // not in consignment record; inherited from outlet
    subtotalAmount: undefined,
    totalAmount: toMinorUnits(raw.total_cost_gain), // best available cost total
    lines: (raw.products ?? []).map((l) => ({
      productId: l.product_id,
      quantityOrdered: typeof l.count === 'number' ? l.count : Number(l.count ?? 0),
      quantityReceived: typeof l.received === 'number' ? l.received : (l.received !== undefined ? Number(l.received) : undefined),
      unitCost: toMinorUnits(l.cost),
      lineTotal: undefined,
    })),
    expectedAt: toIso(raw.due_at),
    orderedAt: toIso(raw.sent_at ?? raw.consignment_date),
    receivedAt: toIso(raw.received_at),
    platform: 'lightspeed-inventory',
    metadata: strMap({
      type: raw.type,
      supplierInvoice: raw.supplier_invoice,
      reference: raw.reference,
    }),
    raw,
  }
}
