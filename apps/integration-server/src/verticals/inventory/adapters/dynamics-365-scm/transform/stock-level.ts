/**
 * Transform Inventory Visibility on-hand query response → canonical StockLevel.
 *
 * The IV indexquery returns an array of objects shaped as:
 * {
 *   productId: string,
 *   dimensions: { siteId, locationId, colorId, sizeId, ... },
 *   quantities: {
 *     fno: { physicalinvent, availordered, reservphysical, reservordered, onorder, ... },
 *     iv:  { totalavailable, softreserved, ... },
 *   }
 * }
 *
 * "fno" = Finance & Operations data source; "iv" = Inventory Visibility computed.
 * physicalinvent  → quantityOnHand (physical stock recorded in F&O)
 * availordered    → quantityAvailable (available to promise in F&O)
 * reservphysical  → quantityCommitted (physically reserved)
 * onorder         → quantityIncoming (ordered but not yet received)
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

/** Quantities sub-object for the "fno" (Finance & Operations) data source. */
interface FnoQuantities {
  physicalinvent?: number
  availordered?: number
  reservphysical?: number
  reservordered?: number
  onorder?: number
  ordered?: number
  arrived?: number
  [key: string]: number | undefined
}

/** Quantities sub-object for the "iv" (Inventory Visibility) computed source. */
interface IvQuantities {
  totalavailable?: number
  softreserved?: number
  [key: string]: number | undefined
}

export interface RawD365IvStockLevel {
  productId: string
  dimensions: {
    siteId?: string
    locationId?: string
    [key: string]: string | undefined
  }
  quantities: {
    fno?: FnoQuantities
    iv?: IvQuantities
    [key: string]: Record<string, number | undefined> | undefined
  }
  [key: string]: unknown
}

export function transformStockLevel(raw: RawD365IvStockLevel): StockLevel {
  const siteId = raw.dimensions?.siteId ?? ''
  const locationId = raw.dimensions?.locationId ?? ''
  const fno = raw.quantities?.fno ?? {}
  const iv = raw.quantities?.iv ?? {}

  const quantityOnHand = fno.physicalinvent ?? 0
  const quantityAvailable = iv.totalavailable ?? fno.availordered
  const quantityCommitted = fno.reservphysical
  const quantityIncoming = fno.onorder

  // Compose a stable composite ID: productId : siteId : locationId
  const id = [raw.productId, siteId, locationId].filter(Boolean).join(':')

  return {
    id,
    productId: raw.productId,
    locationId: locationId || siteId,
    quantityOnHand,
    quantityAvailable,
    quantityCommitted,
    quantityIncoming,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'dynamics-365-scm',
    metadata: strMap({ siteId, locationId }),
    raw,
  }
}
