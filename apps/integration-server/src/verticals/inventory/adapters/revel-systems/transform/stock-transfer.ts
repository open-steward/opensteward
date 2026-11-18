/**
 * Transform Revel Systems InventoryTransfer resource → canonical StockTransfer.
 *
 * Endpoint:  GET /resources/InventoryTransfer/
 *
 * Revel supports transferring inventory between establishments.
 * Key fields (snake_case):
 *   id, from_establishment (FK), to_establishment (FK),
 *   status, created_date, completed_date,
 *   inventory_transfer_items (nested lines)
 *
 * Revel transfer statuses: "Draft", "In Transit", "Completed", "Cancelled"
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickNum, strMap, toIso} from './shared'

export interface RawRevelTransferItem {
  id?: number | string
  /** FK to Ingredient being transferred. */
  ingredient?: number | string | null
  /** Quantity shipped. */
  quantity?: number | string | null
  /** Quantity received at destination. */
  received_quantity?: number | string | null
  [key: string]: unknown
}

export interface RawRevelInventoryTransfer {
  /** Auto-increment PK. */
  id: number | string
  /** FK to source Establishment. */
  from_establishment?: number | string | null
  /** FK to destination Establishment. */
  to_establishment?: number | string | null
  /** Status string: "Draft", "In Transit", "Completed", "Cancelled". */
  status?: string | null
  /** ISO-8601 creation timestamp. */
  created_date?: string
  /** ISO-8601 shipment date. */
  shipped_date?: string | null
  /** ISO-8601 completion/receipt date. */
  completed_date?: string | null
  /** Nested line items. */
  inventory_transfer_items?: RawRevelTransferItem[]
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in transit': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

function resolveUri(v: number | string | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  const match = /\/(\d+)\/?$/.exec(s)
  return match ? match[1] : s
}

export function transformStockTransfer(raw: RawRevelInventoryTransfer): StockTransfer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    fromLocationId: resolveUri(raw.from_establishment),
    toLocationId: resolveUri(raw.to_establishment),
    status: mapStatus(raw.status),
    lines: (raw.inventory_transfer_items ?? []).map((l) => ({
      productId: resolveUri(l.ingredient),
      quantity: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.received_quantity),
    })),
    shippedAt: toIso(raw.shipped_date) ?? undefined,
    receivedAt: toIso(raw.completed_date) ?? undefined,
    platform: 'revel-systems',
    metadata: strMap({ rawStatus: raw.status }),
    raw,
  }
}
