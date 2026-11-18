/**
 * Transform a raw Tecsys OrderDynamics stock-transfer (inter-location move)
 * response into the canonical StockTransfer schema.
 *
 * Tecsys tracks stock movements between locations. These may surface as
 * "Transfer Orders" in the OrderDynamics platform.
 *
 * Key fields: TransferId, TransferNumber, SourceLocationInternalName,
 *   DestinationLocationInternalName, Status, ShippedDate, ReceivedDate, Lines[].
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawTecsysStockTransfer {
  /** Unique internal transfer ID. */
  TransferId: string
  /** Human-readable transfer reference number. */
  TransferNumber?: string
  /** Internal name of the source location. */
  SourceLocationInternalName?: string
  /** Internal name of the destination location. */
  DestinationLocationInternalName?: string
  /** Transfer status string. */
  Status?: string
  /** ISO 8601 date/time the transfer was shipped from source. */
  ShippedDate?: string
  /** ISO 8601 date/time the transfer was received at destination. */
  ReceivedDate?: string
  /** Line items being transferred. */
  Lines?: Array<{
    Sku: string
    QuantityTransferred: number
    QuantityReceived?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'PENDING':
      return 'draft'
    case 'SHIPPED':
    case 'IN TRANSIT':
    case 'INTRANSIT':
      return 'in_transit'
    case 'RECEIVED':
    case 'COMPLETED':
      return 'completed'
    case 'CANCELLED':
    case 'VOIDED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawTecsysStockTransfer): StockTransfer {
  return {
    id: raw.TransferId,
    externalId: raw.TransferId,
    number: pickStr(raw.TransferNumber),
    fromLocationId: raw.SourceLocationInternalName ?? '',
    toLocationId: raw.DestinationLocationInternalName ?? '',
    status: mapStatus(raw.Status),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.Sku,
      quantity: l.QuantityTransferred,
      quantityReceived: l.QuantityReceived,
    })),
    shippedAt: toIso(raw.ShippedDate),
    receivedAt: toIso(raw.ReceivedDate),
    platform: 'tecsys',
    metadata: strMap({ rawStatus: raw.Status }),
    raw,
  }
}
