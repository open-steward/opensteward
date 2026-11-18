import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

/**
 * Agiliron does not expose a dedicated Locations/Warehouses REST endpoint in
 * API v4.0.  Locations appear as "StockLocation" strings on product-inventory
 * records.  This transform creates a synthetic Location from those strings so
 * the vertical schema is satisfied.
 *
 * When a full Settings endpoint response is available the optional extra fields
 * (address, code) can be populated.
 */
export interface RawAgilironLocation {
  /** The stock-location name used across ProductsInventory records */
  StockLocation: string
  /** Optional address detail if available from a settings/warehouse response */
  Address?: string
  City?: string
  State?: string
  Country?: string
  PostalCode?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawAgilironLocation): Location {
  const name = pickStr(raw.StockLocation) ?? ''
  return {
    id: name,
    externalId: name,
    name,
    type: 'warehouse',
    address: raw.Address ? {
      line1: pickStr(raw.Address),
      city: pickStr(raw.City),
      region: pickStr(raw.State),
      country: pickStr(raw.Country),
      postalCode: pickStr(raw.PostalCode),
    } : undefined,
    isActive: true,
    platform: 'agiliron',
    metadata: strMap({}),
    raw,
  }
}
