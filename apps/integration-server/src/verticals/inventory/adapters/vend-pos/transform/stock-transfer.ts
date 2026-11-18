/**
 * Transform a Vend POS (Lightspeed Retail X-Series) outlet-to-outlet consignment
 * into the OpenSteward canonical StockTransfer schema.
 *
 * Vend models stock transfers as "consignments" with type = "OUTLET".
 * API reference: GET /api/2.0/consignments?type=OUTLET
 *
 * Key fields:
 *   id, source_outlet_id (from), outlet_id (to), status, consignment_date,
 *   received_at, consignment_products (line items)
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'
import type { RawVendConsignmentProduct } from './purchase-order'

export interface RawVendOutletConsignment {
  /** UUID */
  id: string
  name?: string
  /** UUID of source outlet (ships from) */
  source_outlet_id?: string
  /** UUID of destination outlet (ships to) */
  outlet_id?: string
  /** OPEN | SENT | RECEIVED | CANCELLED */
  status?: string
  consignment_date?: string
  received_at?: string
  /** Line items (populated by calling listConsignmentProducts) */
  consignment_products?: RawVendConsignmentProduct[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN':
    case 'DRAFT':
      return 'draft'
    case 'SENT':
      return 'in_transit'
    case 'RECEIVED':
    case 'COMPLETED':
      return 'completed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawVendOutletConsignment): StockTransfer {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.name),
    fromLocationId: raw.source_outlet_id ?? '',
    toLocationId: raw.outlet_id ?? '',
    status: mapStatus(raw.status),
    lines: (raw.consignment_products ?? []).map((l) => ({
      productId: l.product_id,
      quantity: l.count ?? 0,
      quantityReceived: l.received,
    })),
    shippedAt: toIso(raw.consignment_date),
    receivedAt: toIso(raw.received_at),
    platform: 'vend-pos',
    metadata: strMap({}),
    raw,
  }
}
