/**
 * Transform Ongoing WMS movement response → canonical StockTransfer.
 *
 * GET /movements returns warehouse-to-warehouse article transfers.
 * Fields sourced from the Ongoing WMS Goods Owner REST API OpenAPI spec.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {strMap, toIso} from './shared'

export interface RawOngoingWmsMovement {
  movementId?: number
  articleNumber?: string
  articleSystemId?: number
  numberOfItems?: number
  fromLocationName?: string
  toLocationName?: string
  fromWarehouseId?: number
  toWarehouseId?: number
  moveTime?: string
  [key: string]: unknown
}

function mapStatus(_raw: RawOngoingWmsMovement): StockTransferStatus {
  // Movements in Ongoing WMS are completed events; no in-transit state
  return 'completed'
}

export function transformStockTransfer(raw: RawOngoingWmsMovement): StockTransfer {
  const id = String(raw.movementId ?? '')
  const articleId = String(raw.articleSystemId ?? raw.articleNumber ?? '')

  return {
    id,
    externalId: id,
    number: id,
    fromLocationId: String(raw.fromWarehouseId ?? raw.fromLocationName ?? ''),
    toLocationId: String(raw.toWarehouseId ?? raw.toLocationName ?? ''),
    status: mapStatus(raw),
    lines: [
      {
        productId: articleId,
        quantity: raw.numberOfItems ?? 0,
        quantityReceived: raw.numberOfItems,
      },
    ],
    shippedAt: undefined,
    receivedAt: toIso(raw.moveTime),
    platform: 'ongoing-wms',
    metadata: strMap({
      fromLocationName: raw.fromLocationName,
      toLocationName: raw.toLocationName,
      fromWarehouseId: raw.fromWarehouseId,
      toWarehouseId: raw.toWarehouseId,
    }),
    raw,
  }
}
