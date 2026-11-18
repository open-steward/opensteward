/**
 * Orderbot stock-transfer transform.
 *
 * Orderbot supports inter-location (DC-to-DC) transfer orders.
 * Field names follow the snake_case REST convention.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOrderbotStockTransferLine {
  product_id?: string | number
  sku?: string
  quantity?: number | string
  quantity_received?: number | string
  [key: string]: unknown
}

export interface RawOrderbotStockTransfer {
  id?: string | number
  number?: string
  transfer_number?: string
  from_location_id?: string | number
  to_location_id?: string | number
  from_distribution_center_id?: string | number
  to_distribution_center_id?: string | number
  status?: string
  lines?: RawOrderbotStockTransferLine[]
  line_items?: RawOrderbotStockTransferLine[]
  shipped_at?: string
  ship_date?: string
  received_at?: string
  completed_at?: string
  created_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase().replace(/[_\s-]/g, '')) {
    case 'draft':
      return 'draft'
    case 'intransit':
    case 'shipped':
    case 'inprogress':
      return 'in_transit'
    case 'completed':
    case 'received':
      return 'completed'
    case 'cancelled':
    case 'voided':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawOrderbotStockTransfer): StockTransfer {
  const id = String(raw.id ?? '')
  const fromLocationId = String(
    raw.from_location_id ?? raw.from_distribution_center_id ?? ''
  )
  const toLocationId = String(
    raw.to_location_id ?? raw.to_distribution_center_id ?? ''
  )
  const rawLines = raw.lines ?? raw.line_items ?? []
  return {
    id,
    externalId: id,
    number: pickStr(raw.number) ?? pickStr(raw.transfer_number),
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.status),
    lines: rawLines.map((l) => ({
      productId: String(l.product_id ?? l.sku ?? ''),
      quantity: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.quantity_received),
    })),
    shippedAt: toIso(raw.shipped_at) ?? toIso(raw.ship_date),
    receivedAt: toIso(raw.received_at) ?? toIso(raw.completed_at),
    platform: 'orderbot',
    metadata: strMap({}),
    raw,
  }
}
