import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {strMap, toIso} from './shared'

export interface RawSkulabsTransferOrder {
  _id: string
  number?: number | string
  name?: string
  source_warehouse_id?: string
  destination_warehouse_id?: string
  status?: string
  notes?: string | null
  items?: Array<{
    _id?: string
    item_id?: string
    quantity?: number
    deducted_quantity?: number
    transferred_quantity?: number
    source_location_id?: string
    destination_location_id?: string
  }>
  log?: Array<{ action?: string; time?: string }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created': return 'draft'
    case 'processing': case 'transit': return 'in_transit'
    case 'closed': return 'completed'
    default: return 'draft'
  }
}

function findLogTime(log: Array<{ action?: string; time?: string }> | undefined, action: string): string | undefined {
  const entry = (log ?? []).find((e) => (e.action ?? '').toLowerCase().includes(action))
  return entry ? toIso(entry.time) : undefined
}

export function transformStockTransfer(raw: RawSkulabsTransferOrder): StockTransfer {
  const log = raw.log as Array<{ action?: string; time?: string }> | undefined
  return {
    id: raw._id,
    externalId: raw._id,
    number: raw.number !== undefined ? String(raw.number) : undefined,
    fromLocationId: raw.source_warehouse_id ?? '',
    toLocationId: raw.destination_warehouse_id ?? '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((l) => ({
      productId: l.item_id ?? '',
      quantity: l.quantity ?? 0,
      quantityReceived: l.transferred_quantity,
    })),
    shippedAt: findLogTime(log, 'transit') ?? findLogTime(log, 'ship'),
    receivedAt: findLogTime(log, 'close') ?? findLogTime(log, 'complet'),
    platform: 'skulabs',
    metadata: strMap({ notes: raw.notes, name: raw.name }),
    raw,
  }
}
