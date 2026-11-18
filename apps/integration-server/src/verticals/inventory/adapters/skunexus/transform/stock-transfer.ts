import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw stock transfer record from the SkuNexus REST API.
 * SkuNexus calls these "transfer orders" in the UI.
 * Endpoint: GET /api/v1/transfer_orders  (list) / GET /api/v1/transfer_orders/:id (single)
 */
export interface RawSkuNexusStockTransfer {
  id: string | number
  transfer_number?: string
  from_location_id?: string | number | null
  to_location_id?: string | number | null
  status?: string
  line_items?: Array<{
    id?: string | number
    product_id: string | number
    quantity: number | string
    quantity_received?: number | string
  }>
  shipped_at?: string
  received_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'pending': return 'draft'
    case 'in_transit': case 'shipped': case 'in transit': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'voided': case 'cancelled': case 'canceled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSkuNexusStockTransfer): StockTransfer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_number),
    fromLocationId: raw.from_location_id != null ? String(raw.from_location_id) : '',
    toLocationId: raw.to_location_id != null ? String(raw.to_location_id) : '',
    status: mapStatus(raw.status),
    lines: (raw.line_items ?? []).map((l) => ({
      productId: String(l.product_id),
      quantity: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.quantity_received),
    })),
    shippedAt: toIso(raw.shipped_at),
    receivedAt: toIso(raw.received_at),
    platform: 'skunexus',
    metadata: strMap({}),
    raw,
  }
}
