/**
 * iQmetrix Inventory Availability API — stock-level transform.
 *
 * Source: GET /Companies({CompanyId})/CatalogItems/Availability
 *         GET /Companies({CompanyId})/CatalogItems({CatalogItemId})/Availability
 *         GET /Companies({CompanyId})/Entities({LocationId})/CatalogItems/Availability
 *
 * Key response fields:
 *   Id                   — UUID availability record identifier
 *   CatalogItemId        — maps to product (UUID)
 *   EntityId             — location / store integer ID
 *   Quantity             — total quantity on hand (integer)
 *   IsAvailable          — boolean shorthand flag
 *   LastModifiedDateUtc  — ISO timestamp of last change
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, strMap, toIso} from './shared'

export interface RawIqmetrixAvailability {
  Id: string
  CatalogItemId?: string
  EntityId?: number
  Quantity?: number
  IsAvailable?: boolean
  LastModifiedDateUtc?: string
  [key: string]: unknown
}

export function transformStockLevel(raw: RawIqmetrixAvailability): StockLevel {
  const productId  = pickStr(raw.CatalogItemId) ?? ''
  const locationId = raw.EntityId !== undefined ? String(raw.EntityId) : ''
  return {
    id:                raw.Id,
    productId,
    locationId,
    quantityOnHand:    raw.Quantity ?? 0,
    quantityAvailable: raw.IsAvailable ? (raw.Quantity ?? 0) : 0,
    lastCountedAt:     toIso(raw.LastModifiedDateUtc),
    platform:          'iqmetrix',
    metadata: strMap({ isAvailable: raw.IsAvailable }),
    raw,
  }
}
