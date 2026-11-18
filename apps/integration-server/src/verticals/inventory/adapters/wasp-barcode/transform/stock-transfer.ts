/**
 * Transform Wasp InventoryCloud move transaction → canonical StockTransfer.
 *
 * InventoryCloud models item moves as individual transactions (transactions/item/move).
 * Each move record captures a single item being transferred from one
 * location to another within or between sites.
 *
 * Fields (from transactions/grid-query/transaction-history with type=move):
 *   TransactionId   — unique transaction identifier
 *   ItemNumber      — item being moved
 *   FromLocationCode / FromSiteName — source location
 *   ToLocationCode / ToSiteName     — destination location
 *   Quantity        — quantity moved
 *   TransactionDate — when the move occurred
 *   UserName        — who performed the move
 *
 * InventoryCloud does not have a dedicated "transfer order" entity with a
 * lifecycle (draft → in_transit → completed). Each move transaction is
 * atomic and already completed at creation time.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawWaspBarcodeStockTransfer {
  TransactionId?: string | number
  ItemNumber?: string
  FromLocationCode?: string
  FromSiteName?: string
  ToLocationCode?: string
  ToSiteName?: string
  Quantity?: number | string
  TransactionDate?: string
  UserName?: string
  [key: string]: unknown
}

export function transformStockTransfer(raw: RawWaspBarcodeStockTransfer): StockTransfer {
  const id = String(raw.TransactionId ?? '')
  const fromLocationId =
    pickStr(raw.FromLocationCode) ?? pickStr(raw.FromSiteName) ?? ''
  const toLocationId =
    pickStr(raw.ToLocationCode) ?? pickStr(raw.ToSiteName) ?? ''
  const qty = pickNum(raw.Quantity) ?? 0

  // Move transactions are already completed when retrieved
  const status: StockTransferStatus = 'completed'

  return {
    id,
    externalId: id,
    number: id,
    fromLocationId,
    toLocationId,
    status,
    lines: [
      {
        productId: pickStr(raw.ItemNumber) ?? '',
        quantity: qty,
        quantityReceived: qty,
      },
    ],
    shippedAt: toIso(raw.TransactionDate),
    receivedAt: toIso(raw.TransactionDate),
    platform: 'wasp-barcode',
    metadata: strMap({
      fromSite: raw.FromSiteName,
      toSite: raw.ToSiteName,
      performedBy: raw.UserName,
    }),
    raw,
  }
}
