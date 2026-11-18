/**
 * Qoblex stock-transfer transform.
 *
 * The Qoblex API (v1) only exposes a POST /v1/transfers endpoint (create-only).
 * There is no list or get endpoint for transfers, so this transform is defined
 * for completeness but listStockTransfers / getStockTransfer are not implemented
 * in QoblexAdapter.
 *
 * Source: Qoblex.Application.Transfers.Dtos.GetTransferDto (create response only)
 */
import type { StockTransfer } from '../../../schema/stock-transfer'
import {strMap, toIso} from './shared'

export interface RawQoblexTransfer {
  id: number
  source_location?: string
  destination_location?: string
  transfer_date?: string
  [key: string]: unknown
}

export function transformStockTransfer(raw: RawQoblexTransfer): StockTransfer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    fromLocationId: raw.source_location ?? '',
    toLocationId: raw.destination_location ?? '',
    status: 'completed',
    lines: [],
    shippedAt: toIso(raw.transfer_date),
    platform: 'qoblex',
    metadata: strMap({}),
    raw,
  }
}
