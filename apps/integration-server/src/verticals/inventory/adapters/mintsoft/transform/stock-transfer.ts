import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Mintsoft warehouse-transfer record as returned by
 * GET /api/WarehouseTransfer/List (response schema: ToReturnWarehouseTransfer).
 *
 * Field names sourced from the Mintsoft Swagger spec
 * ToReturnWarehouseTransfer and APIWarehouseTransferItem definitions.
 */
export interface RawMintsoftWarehouseTransfer {
  ID: number
  SourceWarehouseId?: number
  DestinationWarehouseId?: number
  Reference?: string
  WarehouseTransferStatus?: string
  ExpectedDeliveryDate?: string
  LastUpdated?: string
  LastUpdatedByUser?: string
  ClientId?: number
  Comments?: string
  GoodsInType?: string
  Items?: Array<{
    ProductId?: number
    SKU?: string
    Quantity?: number
    Complete?: boolean
  }>
  [key: string]: unknown
}

function mapStatus(status: string | undefined): StockTransferStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('complet') || s.includes('received') || s.includes('booked')) return 'completed'
  if (s.includes('transit') || s.includes('ship') || s.includes('dispatch')) return 'in_transit'
  if (s.includes('cancel') || s.includes('void')) return 'cancelled'
  if (s.includes('draft') || s.includes('new') || s.includes('pending')) return 'draft'
  return 'draft'
}

export function transformStockTransfer(raw: RawMintsoftWarehouseTransfer): StockTransfer {
  const idStr = String(raw.ID)

  const lines = (raw.Items ?? []).map((item) => ({
    productId: item.ProductId !== undefined ? String(item.ProductId) : (pickStr(item.SKU) ?? ''),
    quantity: pickNum(item.Quantity) ?? 0,
    quantityReceived: undefined,
  }))

  return {
    id: idStr,
    externalId: idStr,
    number: pickStr(raw.Reference),
    fromLocationId: raw.SourceWarehouseId !== undefined ? String(raw.SourceWarehouseId) : '',
    toLocationId: raw.DestinationWarehouseId !== undefined ? String(raw.DestinationWarehouseId) : '',
    status: mapStatus(raw.WarehouseTransferStatus),
    lines,
    shippedAt: toIso(raw.LastUpdated),
    receivedAt: undefined,
    platform: 'mintsoft',
    metadata: strMap({
      goodsInType: raw.GoodsInType,
      comments: raw.Comments,
      clientId: raw.ClientId,
    }),
    raw,
  }
}
