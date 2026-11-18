import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso, m2oId, m2oName} from './shared'

/**
 * Fulfil stock.shipment.internal (Internal Shipment / Stock Transfer) record.
 *
 * Moves stock between two warehouse locations within the same company.
 * State: draft | waiting | assigned | in_progress | done | cancelled
 */
export interface RawFulfilInternalShipmentMove {
  id: number
  product?: [number, string] | null
  quantity?: number | null
  done_quantity?: number | null
  [key: string]: unknown
}

export interface RawFulfilStockTransfer {
  /** Integer record id */
  id: number
  /** Reference number */
  number?: string | null
  /** Source location (Many2One) */
  from_location?: [number, string] | null
  /** Destination location (Many2One) */
  to_location?: [number, string] | null
  /** State: draft | waiting | assigned | in_progress | done | cancelled */
  state?: string | null
  /** Planned date */
  planned_date?: string | null
  /** Effective date (when done) */
  effective_date?: string | null
  /** Moves (array of ids or objects) */
  moves?: number[] | RawFulfilInternalShipmentMove[]
  create_date?: string | null
  write_date?: string | null
  [key: string]: unknown
}

/** Fields to request from the API for stock.shipment.internal. */
export const STOCK_TRANSFER_FIELDS = [
  'id', 'number', 'from_location', 'to_location', 'state',
  'planned_date', 'effective_date', 'moves', 'create_date', 'write_date',
]

function mapStatus(s: string | null | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'waiting': return 'draft'
    case 'assigned': case 'in_progress': return 'in_transit'
    case 'done': return 'completed'
    case 'cancelled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(
  raw: RawFulfilStockTransfer,
  moves?: RawFulfilInternalShipmentMove[],
): StockTransfer {
  const id = String(raw.id)

  const resolvedMoves = moves ?? (
    Array.isArray(raw.moves) && raw.moves.length > 0 && typeof raw.moves[0] === 'object'
      ? (raw.moves as RawFulfilInternalShipmentMove[])
      : []
  )

  return {
    id,
    externalId: id,
    number: pickStr(raw.number ?? undefined),
    fromLocationId: m2oId(raw.from_location) ?? '',
    toLocationId: m2oId(raw.to_location) ?? '',
    status: mapStatus(raw.state),
    lines: resolvedMoves.map((m) => ({
      productId: m2oId(m.product) ?? '',
      quantity: m.quantity ?? 0,
      quantityReceived: m.done_quantity ?? undefined,
    })),
    shippedAt: toIso(raw.planned_date),
    receivedAt: toIso(raw.effective_date),
    platform: 'fulfil-io',
    metadata: strMap({
      fromLocationName: m2oName(raw.from_location),
      toLocationName: m2oName(raw.to_location),
    }),
    raw,
  }
}
