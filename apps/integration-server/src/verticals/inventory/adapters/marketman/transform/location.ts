/**
 * MarketMan does not expose a dedicated "locations" or "storage areas" endpoint
 * in its public v3 API. Storage areas are embedded as StorageNames/StorageIDs
 * arrays on inventory items.
 *
 * This transform converts a synthetic storage-area object (derived from item
 * fields during listLocations()) into the canonical Location schema.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawMarketmanLocation {
  /** Storage area ID (from item.StorageIDs[i]) */
  ID: string
  /** Storage area name (from item.StorageNames[i]) */
  Name?: string
  /** Buyer GUID context */
  BuyerGuid?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawMarketmanLocation): Location {
  return {
    id: raw.ID,
    externalId: raw.ID,
    name: pickStr(raw.Name) ?? raw.ID,
    code: undefined,
    // MarketMan exposes no location-type concept at all here — these
    // "storage areas" are synthesized from item.StorageIDs/StorageNames
    // (see file header), not sourced from any real locations endpoint or
    // field. None of the canonical types (warehouse/store/virtual/
    // transit/supplier) can be inferred honestly, so use the schema's
    // designed escape hatch rather than inventing one.
    type: 'unknown',
    parentLocationId: undefined,
    address: undefined,
    isActive: true,
    platform: 'marketman',
    metadata: strMap({ buyerGuid: raw.BuyerGuid }),
    raw,
  }
}
