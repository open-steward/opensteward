/**
 * MarketMan transfer → canonical StockTransfer.
 *
 * Response shape from POST /buyers/inventory/GetTransfers
 * Response key: "Transfers"
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawMarketmanStockTransfer {
  ID?: string | null
  BuyerFromName?: string | null
  BuyerFromGuid?: string | null
  BuyerToName?: string | null
  BuyerToGuid?: string | null
  /** Transfer date UTC */
  DateUTC?: string | null
  TotalPriceWithoutVAT?: number | null
  /** Typo preserved from MarketMan API: "Commments" */
  Commments?: string | null
  TransferStatus?: string | null
  Lines?: Array<{
    LineID?: string | null
    ItemID?: string | null
    ItemName?: string | null
    Quantity?: number | null
    TotalPriceWithoutVAT?: number | null
    UOMID?: string | null
    UOMName?: string | null
  }> | null
  [key: string]: unknown
}

function mapStatus(s: string | undefined | null): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'IN TRANSIT': case 'SENT': case 'SHIPPED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': case 'CONFIRMED': return 'completed'
    case 'CANCELLED': case 'VOIDED': case 'REJECTED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawMarketmanStockTransfer): StockTransfer {
  const id = pickStr(raw.ID) ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.ID),
    fromLocationId: pickStr(raw.BuyerFromGuid) ?? '',
    toLocationId: pickStr(raw.BuyerToGuid) ?? '',
    status: mapStatus(raw.TransferStatus),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: String(l.ItemID ?? ''),
      quantity: l.Quantity ?? 0,
      quantityReceived: undefined,
    })),
    shippedAt: toIso(raw.DateUTC),
    receivedAt: undefined,
    platform: 'marketman',
    metadata: strMap({
      buyerFromName: raw.BuyerFromName,
      buyerToName: raw.BuyerToName,
      totalPrice: raw.TotalPriceWithoutVAT,
      transferStatus: raw.TransferStatus,
    }),
    raw,
  }
}
