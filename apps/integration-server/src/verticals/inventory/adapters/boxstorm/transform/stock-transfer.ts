/**
 * Transform Boxstorm transfer-order record → canonical StockTransfer.
 *
 * NOTE: The Boxstorm (Fishbowl Advanced cloud) REST API does not expose a
 * list endpoint for stock transfers.  The /api/inventory/move endpoint is
 * write-only (POST).  This transform is provided for completeness and
 * forward-compatibility; it is NOT wired into listStockTransfers /
 * getStockTransfer in index.ts because there is no source endpoint to call.
 *
 * If Boxstorm adds a read endpoint in a future API revision, wire it in
 * index.ts and remove this notice.
 *
 * Field names follow the Fishbowl Advanced REST API camelCase convention
 * (consistent with the existing parts / vendors / purchase-orders transforms).
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawBoxstormTransferLine {
  /** Part identifier (integer or string). */
  partId?: number | string
  /** Part number string (alternative identifier). */
  partNumber?: string
  /** Quantity requested for transfer. */
  quantity?: number
  /** Quantity actually received at the destination. */
  quantityReceived?: number
  [key: string]: unknown
}

export interface RawBoxstormStockTransfer {
  /** Numeric primary key. */
  id: number | string
  /** Human-readable transfer number (e.g. "TO-1042"). */
  number?: string
  /** Source location id or name. */
  fromLocationId?: number | string
  fromLocationName?: string
  /** Destination location id or name. */
  toLocationId?: number | string
  toLocationName?: string
  /** Status string (e.g. "Draft", "In Transit", "Completed", "Voided"). */
  status?: string
  /** ISO-8601 date the transfer was shipped. */
  dateShipped?: string
  /** ISO-8601 date the transfer was completed / received. */
  dateCompleted?: string
  lines?: RawBoxstormTransferLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in transit': case 'in_transit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'voided': case 'cancelled': case 'void': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawBoxstormStockTransfer): StockTransfer {
  const id = String(raw.id)
  const fromLocationId =
    raw.fromLocationId != null
      ? String(raw.fromLocationId)
      : pickStr(raw.fromLocationName) ?? ''
  const toLocationId =
    raw.toLocationId != null
      ? String(raw.toLocationId)
      : pickStr(raw.toLocationName) ?? ''

  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.partId != null ? String(l.partId) : pickStr(l.partNumber) ?? '',
      quantity: l.quantity ?? 0,
      quantityReceived: l.quantityReceived,
    })),
    shippedAt: toIso(raw.dateShipped),
    receivedAt: toIso(raw.dateCompleted),
    platform: 'boxstorm',
    metadata: strMap({ rawStatus: raw.status }),
    raw,
  }
}
