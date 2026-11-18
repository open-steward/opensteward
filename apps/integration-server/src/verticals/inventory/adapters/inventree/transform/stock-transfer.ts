import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {strMap, toIso} from './shared'

/**
 * Raw StockTracking record from InvenTree GET /api/stock/track/
 * Source: InvenTree API schema v265, StockTracking schema.
 *
 * InvenTree does not expose discrete "StockTransfer" objects.
 * Instead, stock movement history is recorded as StockTracking entries.
 * tracking_type == 1 (SENT_TO) / 2 (RECEIVED_INTO) correspond to transfers.
 *
 * deltas: JSON object recording the change, e.g.:
 *   { "location": { "prev": 3, "new": 7 }, "quantity": { "prev": 10, "new": 10 } }
 */
export interface RawInvenTreeStockTracking {
  pk: number
  item: number                           // StockItem ID
  date?: string | null
  tracking_type?: number                 // 1=transfer, 2=count, 3=add, 4=remove, etc.
  label?: string
  notes?: string | null
  user?: number | null
  deltas?: {
    location?: { prev?: number | null; new?: number | null }
    quantity?: { prev?: number; new?: number }
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

function mapStatus(_type: number | undefined): StockTransferStatus {
  // All tracking entries are completed historical records
  return 'completed'
}

export function transformStockTransfer(raw: RawInvenTreeStockTracking): StockTransfer {
  const id = String(raw.pk)
  const fromLocationId = raw.deltas?.location?.prev != null ? String(raw.deltas.location.prev) : ''
  const toLocationId = raw.deltas?.location?.new != null ? String(raw.deltas.location.new) : ''
  const quantity = raw.deltas?.quantity?.new ?? raw.deltas?.quantity?.prev ?? 0

  return {
    id,
    externalId: id,
    number: undefined,
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.tracking_type),
    lines: [{
      productId: String(raw.item),
      quantity,
      quantityReceived: quantity,
    }],
    shippedAt: toIso(raw.date),
    receivedAt: toIso(raw.date),
    platform: 'inventree',
    metadata: strMap({
      label: raw.label,
      notes: raw.notes,
      trackingType: raw.tracking_type,
      userId: raw.user,
    }),
    raw,
  }
}
