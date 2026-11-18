import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

/**
 * KORONA.cloud API v3 ProductStock shape.
 * Returned by GET /accounts/{id}/products/{productId}/stocks
 * and GET /accounts/{id}/organizationalUnits/{ouId}/productStocks.
 *
 * Amount object: { actual, lent, maxLevel, ordered, reorderLevel }
 */
export interface RawKoronaPosProductStock {
  product?: { id?: string; number?: string }
  warehouse?: { id?: string; number?: string }
  amount?: {
    actual?: number
    lent?: number
    maxLevel?: number
    ordered?: number
    reorderLevel?: number
  }
  averagePurchasePrice?: number
  revision?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawKoronaPosProductStock): StockLevel {
  const productId = raw.product?.id ?? ''
  const locationId = raw.warehouse?.id ?? ''
  const amount = raw.amount ?? {}

  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    quantityOnHand: amount.actual ?? 0,
    quantityAvailable: undefined,
    quantityCommitted: amount.lent,
    quantityIncoming: amount.ordered,
    reorderPoint: amount.reorderLevel,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'korona-pos',
    metadata: strMap({
      maxLevel: amount.maxLevel,
      averagePurchasePrice: raw.averagePurchasePrice,
      productNumber: raw.product?.number,
      warehouseNumber: raw.warehouse?.number,
    }),
    raw,
  }
}
