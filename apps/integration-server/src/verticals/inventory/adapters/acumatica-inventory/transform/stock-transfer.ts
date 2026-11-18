import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawAcumaticaInventoryStockTransfer {
  ID: string
  Number?: string
  FromLocation?: string
  ToLocation?: string
  Status?: string
  Lines?: Array<{ ProductID: string; Quantity: number; Received?: number }>
  ShipDate?: string
  CompletedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'IN TRANSIT': case 'SHIPPED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': return 'completed'
    case 'VOIDED': case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawAcumaticaInventoryStockTransfer): StockTransfer {
  return {
    id: raw.ID,
    externalId: raw.ID,
    number: pickStr(raw.Number),
    fromLocationId: raw.FromLocation ?? '',
    toLocationId: raw.ToLocation ?? '',
    status: mapStatus(raw.Status),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.ProductID,
      quantity: l.Quantity,
      quantityReceived: l.Received,
    })),
    shippedAt: toIso(raw.ShipDate),
    receivedAt: toIso(raw.CompletedDate),
    platform: 'acumatica-inventory',
    metadata: strMap({}),
    raw,
  }
}
