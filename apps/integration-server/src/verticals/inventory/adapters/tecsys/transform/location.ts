/**
 * Transform a raw Tecsys OrderDynamics inventory-location response into the
 * canonical Location schema.
 *
 * OrderDynamics endpoint: GET /v1/inventorylocations/
 * Key fields: InternalName, PublicName, IsActive, ParentInternalName,
 *   AddressLine1, AddressLine2, City, State, ZipCode, CountryCode
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawTecsysLocation {
  /** Unique internal identifier for this location — used as id. */
  InternalName: string
  /** Human-readable public name. */
  PublicName?: string
  /** Short code / abbreviation for the location. */
  ShortCode?: string
  /** Whether this is the default fulfillment location. */
  IsDefault?: boolean | string | number
  /** Whether this location is currently active. */
  IsActive?: boolean | string | number
  /** Internal name of a parent location (for sub-locations). */
  ParentInternalName?: string
  /** Street address line 1. */
  AddressLine1?: string
  /** Street address line 2. */
  AddressLine2?: string
  /** City. */
  City?: string
  /** State or province code. */
  State?: string
  /** Postal / ZIP code. */
  ZipCode?: string
  /** ISO 3166-1 alpha-2 country code. */
  CountryCode?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawTecsysLocation): Location {
  const hasAddress =
    raw.AddressLine1 ||
    raw.City ||
    raw.State ||
    raw.ZipCode ||
    raw.CountryCode

  return {
    id: raw.InternalName,
    externalId: raw.InternalName,
    name: pickStr(raw.PublicName ?? raw.InternalName) ?? '',
    code: pickStr(raw.ShortCode),
    type: 'warehouse',
    parentLocationId: pickStr(raw.ParentInternalName),
    address: hasAddress
      ? {
          line1: raw.AddressLine1,
          line2: raw.AddressLine2,
          city: raw.City,
          region: raw.State,
          country: raw.CountryCode,
          postalCode: raw.ZipCode,
        }
      : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    platform: 'tecsys',
    metadata: strMap({ isDefault: raw.IsDefault }),
    raw,
  }
}
