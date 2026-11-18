import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw stock-transfer record from GET /api/v1/transfers (PULPO WMS).
 */
export interface RawPulpoWmsStockTransfer {
  id: string
  number?: string
  reference?: string
  from_warehouse_id?: string
  to_warehouse_id?: string
  status?: string
  lines?: Array<{
    product_id: string
    quantity: number
    quantity_received?: number
  }>
  shipped_at?: string
  received_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in_transit': case 'shipped': case 'in transit': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawPulpoWmsStockTransfer): StockTransfer {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.number) ?? pickStr(raw.reference),
    fromLocationId: raw.from_warehouse_id ?? '',
    toLocationId: raw.to_warehouse_id ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.product_id,
      quantity: l.quantity,
      quantityReceived: l.quantity_received,
    })),
    shippedAt: toIso(raw.shipped_at),
    receivedAt: toIso(raw.received_at),
    platform: 'pulpo-wms',
    metadata: strMap({}),
    raw,
  }
}
