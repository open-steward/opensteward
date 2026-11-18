/**
 * Transform Restaurant365 OData `TransactionDetail` (rowType=InventoryCount)
 * -> canonical StockLevel.
 *
 * R365 does not expose a dedicated stock-on-hand endpoint in the OData API.
 * The closest proxy is TransactionDetail rows where the parent Transaction is
 * an Inventory Count (type="Inventory Count"). The `quantity` field holds the
 * counted quantity; `adjustment` is the delta applied.
 *
 * OData entity fields used:
 *   transactionDetailId   Guid   — row key
 *   transactionId         Guid   — parent transaction
 *   locationId            Guid   — store/location
 *   itemId                Guid   — product
 *   quantity              Decimal — counted / on-hand quantity
 *   adjustment            Decimal — inventory variance
 *   previousCountTotal    Decimal — previous count
 *   unitOfMeasureName     String
 *   createdOn             DateTimeOffset
 *   modifiedOn            DateTimeOffset
 *   rowType               String — e.g. "Inventory Count"
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'

export interface RawR365TransactionDetail {
  transactionDetailId: string
  transactionId?: string
  locationId?: string
  itemId?: string
  quantity?: number
  adjustment?: number
  previousCountTotal?: number
  unitOfMeasureName?: string
  rowType?: string
  createdOn?: string
  modifiedOn?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawR365TransactionDetail): StockLevel {
  const locationId = raw.locationId ?? ''
  const productId = raw.itemId ?? ''
  return {
    id: `${productId}:${locationId}:${raw.transactionDetailId}`,
    productId,
    locationId,
    quantityOnHand: raw.quantity ?? 0,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.modifiedOn ?? raw.createdOn),
    platform: 'restaurant365',
    metadata: strMap({
      transactionId: raw.transactionId,
      rowType: raw.rowType,
      unitOfMeasureName: raw.unitOfMeasureName,
      adjustment: raw.adjustment !== undefined ? String(raw.adjustment) : undefined,
      previousCountTotal: raw.previousCountTotal !== undefined ? String(raw.previousCountTotal) : undefined,
    }),
    raw,
  }
}
