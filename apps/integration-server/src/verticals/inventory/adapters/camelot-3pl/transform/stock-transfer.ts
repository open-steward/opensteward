import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Camelot 3PL / Excalibur WMS — intra-warehouse transfer record.
 *
 * Camelot's Excalibur WMS does not expose a dedicated stock-transfer endpoint
 * in its standard Data Interface Module. This transform is provided for
 * deployments that surface transfer records through a custom export profile;
 * the field names match the common Excalibur JSON export convention.
 */
export interface RawCamelot3plStockTransfer {
  transferId: string
  transferNumber?: string
  fromWarehouseId?: string
  toWarehouseId?: string
  status?: string
  lines?: Array<{ itemId: string; quantity: number; quantityReceived?: number }>
  shipDate?: string
  completedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'PENDING': return 'draft'
    case 'IN TRANSIT': case 'SHIPPED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': return 'completed'
    case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawCamelot3plStockTransfer): StockTransfer {
  return {
    id: String(raw.transferId),
    externalId: String(raw.transferId),
    number: pickStr(raw.transferNumber),
    fromLocationId: String(raw.fromWarehouseId ?? ''),
    toLocationId: String(raw.toWarehouseId ?? ''),
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      quantity: l.quantity,
      quantityReceived: l.quantityReceived,
    })),
    shippedAt: toIso(raw.shipDate),
    receivedAt: toIso(raw.completedDate),
    platform: 'camelot-3pl',
    metadata: strMap({}),
    raw,
  }
}
