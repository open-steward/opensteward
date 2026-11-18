/**
 * SPS Commerce stock-transfer transform (forward-compatibility stub).
 *
 * NOTE: The SPS Commerce public REST API does not expose a stock-transfer
 * (inventory-movement / transfer-order) endpoint.  SPS Commerce is primarily
 * a retail EDI network and its Fulfillment API covers purchase orders (EDI 850),
 * inventory advisories (EDI 846), item catalogs, vendors, and locations.
 * Warehouse transfer records between locations are not part of the public API
 * surface as of the current API version.
 *
 * This transform is provided for completeness and forward-compatibility.
 * It is NOT wired into listStockTransfers / getStockTransfer in index.ts
 * because there is no source endpoint to call.
 *
 * If SPS Commerce adds a transfer-order read endpoint in a future API revision,
 * wire it in index.ts and remove this notice.
 *
 * Reference: https://docs.api.spscommerce.com/
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSpsCommerceTransferLine {
  /** Item identifier */
  item_id?: string
  /** Buyer-assigned item number */
  buyer_item_number?: string
  /** Quantity requested for transfer */
  quantity?: number
  /** Quantity received at destination */
  quantity_received?: number
  [key: string]: unknown
}

export interface RawSpsCommerceStockTransfer {
  /** SPS Commerce internal transfer identifier */
  transfer_id: string
  /** Human-readable transfer number */
  transfer_number?: string
  /** Source location identifier */
  from_location_id?: string
  from_location?: string
  /** Destination location identifier */
  to_location_id?: string
  to_location?: string
  /** Status string */
  status?: string
  /** ISO-8601 or date string when shipped */
  ship_date?: string
  /** ISO-8601 or date string when received */
  receive_date?: string
  lines?: RawSpsCommerceTransferLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in_transit': case 'in transit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSpsCommerceStockTransfer): StockTransfer {
  const id = raw.transfer_id
  const fromLocationId =
    raw.from_location_id != null
      ? String(raw.from_location_id)
      : pickStr(raw.from_location) ?? ''
  const toLocationId =
    raw.to_location_id != null
      ? String(raw.to_location_id)
      : pickStr(raw.to_location) ?? ''

  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_number),
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.item_id != null ? String(l.item_id) : pickStr(l.buyer_item_number) ?? '',
      quantity: l.quantity ?? 0,
      quantityReceived: l.quantity_received,
    })),
    shippedAt: toIso(raw.ship_date),
    receivedAt: toIso(raw.receive_date),
    platform: 'sps-commerce',
    metadata: strMap({ rawStatus: raw.status }),
    raw,
  }
}
