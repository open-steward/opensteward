/**
 * Deck Commerce does not expose a stock transfer REST endpoint in its OMS API.
 * Transfers between DCs are tracked internally within the OMS.
 *
 * This transform handles any transfer-like data that may appear in future API
 * responses. Field names follow the Deck Commerce naming convention.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawDeckCommerceStockTransfer {
  TransferID?: string
  TransferNumber?: string
  FromWarehouseCode?: string
  ToWarehouseCode?: string
  Status?: string
  Lines?: Array<{ SKU: string; Qty: number; ReceivedQty?: number }>
  ShipDateUTC?: string
  ReceivedDateUTC?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'PENDING': return 'draft'
    case 'INTRANSIT': case 'IN TRANSIT': case 'SHIPPED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': return 'completed'
    case 'VOIDED': case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawDeckCommerceStockTransfer): StockTransfer {
  const id = pickStr(raw.TransferID) ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.TransferNumber),
    fromLocationId: pickStr(raw.FromWarehouseCode) ?? '',
    toLocationId: pickStr(raw.ToWarehouseCode) ?? '',
    status: mapStatus(raw.Status),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.SKU,
      quantity: l.Qty,
      quantityReceived: l.ReceivedQty,
    })),
    shippedAt: toIso(raw.ShipDateUTC),
    receivedAt: toIso(raw.ReceivedDateUTC),
    platform: 'deck-commerce',
    metadata: strMap({}),
    raw,
  }
}
