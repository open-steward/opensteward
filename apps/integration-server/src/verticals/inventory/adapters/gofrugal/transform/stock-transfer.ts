/**
 * GoFrugal RetailEasy stock-transfer transform.
 *
 * GoFrugal's public WebReporter API (api/v1) does not expose a stock-transfer
 * listing endpoint. This file is a placeholder for future use. The adapter
 * does NOT implement listStockTransfers / getStockTransfer.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawGofrugalStockTransfer {
  transferId: number | string
  transferNumber?: string
  fromLocationId?: number | string
  toLocationId?: number | string
  status?: string
  shippedAt?: string
  receivedAt?: string
  lines?: Array<{
    itemId: number | string
    quantity: number
    receivedQty?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'IN TRANSIT': case 'SHIPPED': case 'DISPATCHED': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': return 'completed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawGofrugalStockTransfer): StockTransfer {
  const id = String(raw.transferId)
  return {
    id,
    externalId: id,
    number: pickStr(raw.transferNumber),
    fromLocationId: raw.fromLocationId != null ? String(raw.fromLocationId) : '',
    toLocationId: raw.toLocationId != null ? String(raw.toLocationId) : '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      quantity: l.quantity,
      quantityReceived: l.receivedQty,
    })),
    shippedAt: toIso(raw.shippedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'gofrugal',
    metadata: strMap({}),
    raw,
  }
}
