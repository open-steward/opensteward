/**
 * Transform StockTrim stock-transfer record → canonical StockTransfer.
 *
 * NOTE: The StockTrim REST API does not expose any endpoint for stock-transfer
 * documents (inter-location inventory moves).  Location-to-location transfers
 * are not modelled in the StockTrim API; inventory adjustments at each location
 * are the only mechanism available.  This transform is provided for completeness
 * and forward-compatibility; it is NOT wired into listStockTransfers /
 * getStockTransfer in index.ts because there is no source endpoint to call.
 *
 * If StockTrim adds a transfer endpoint in a future API revision, wire it in
 * index.ts and remove this notice.
 *
 * Field names are modelled on the StockTrim Products / Locations schemas
 * (https://api.stocktrim.com/index.html) extended with transfer metadata
 * that would be expected from a future endpoint.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawStockTrimTransferLine {
  /** Product identifier (productId). */
  productId: string
  /** Quantity requested for transfer. */
  quantity?: number
  /** Quantity actually received at the destination. */
  quantityReceived?: number
  [key: string]: unknown
}

export interface RawStockTrimStockTransfer {
  /** Opaque identifier for the transfer document. */
  id: string
  /** Human-readable transfer reference number. */
  number?: string
  /** Source location code. */
  fromLocationCode?: string
  /** Source location display name. */
  fromLocationName?: string
  /** Destination location code. */
  toLocationCode?: string
  /** Destination location display name. */
  toLocationName?: string
  /** Status string (e.g. "Draft", "InTransit", "Completed", "Cancelled"). */
  status?: string
  /** ISO-8601 date the transfer was shipped. */
  shippedAt?: string
  /** ISO-8601 date the transfer was completed / received. */
  receivedAt?: string
  lines?: RawStockTrimTransferLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'intransit': case 'in_transit': case 'in transit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'voided': case 'void': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawStockTrimStockTransfer): StockTransfer {
  const fromLocationId =
    typeof raw.fromLocationCode === 'string' && raw.fromLocationCode
      ? raw.fromLocationCode
      : pickStr(raw.fromLocationName) ?? ''

  const toLocationId =
    typeof raw.toLocationCode === 'string' && raw.toLocationCode
      ? raw.toLocationCode
      : pickStr(raw.toLocationName) ?? ''

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.number),
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.productId,
      quantity: l.quantity ?? 0,
      quantityReceived: l.quantityReceived,
    })),
    shippedAt: toIso(raw.shippedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'stocktrim',
    metadata: strMap({
      rawStatus: raw.status,
      fromLocationName: raw.fromLocationName,
      toLocationName: raw.toLocationName,
    }),
    raw,
  }
}
