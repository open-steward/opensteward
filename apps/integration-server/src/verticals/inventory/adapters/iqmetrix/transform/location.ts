/**
 * iQmetrix Entity Manager API — location transform.
 *
 * Source: GET /Companies({CompanyId})/Locations
 *
 * Key response fields:
 *   Id               — integer location ID (stored as string)
 *   Name             — display name (e.g. "Dufferin Mall")
 *   DisplayName      — alternate display name
 *   Description      — optional description
 *   Address          — nested object with AddressLine1, AddressLine2, City,
 *                      StateCode, StateName, CountryCode, CountryName, Zip
 *   CreatedUtc / LastModifiedUtc
 *   Version          — integer revision counter
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawIqmetrixLocation {
  Id: number | string
  Name?: string
  DisplayName?: string
  Description?: string
  Address?: {
    AddressLine1?: string
    AddressLine2?: string
    City?: string
    StateCode?: string
    StateName?: string
    CountryCode?: string
    CountryName?: string
    Zip?: string
  }
  CreatedUtc?: string
  LastModifiedUtc?: string
  Version?: number
  [key: string]: unknown
}

export function transformLocation(raw: RawIqmetrixLocation): Location {
  const id = String(raw.Id)
  const addr = raw.Address
  return {
    id,
    externalId:  id,
    name:        pickStr(raw.Name) ?? pickStr(raw.DisplayName) ?? '',
    type:        'store',
    address: addr ? {
      line1:      pickStr(addr.AddressLine1),
      line2:      pickStr(addr.AddressLine2),
      city:       pickStr(addr.City),
      region:     pickStr(addr.StateCode) ?? pickStr(addr.StateName),
      country:    pickStr(addr.CountryCode) ?? pickStr(addr.CountryName),
      postalCode: pickStr(addr.Zip),
    } : undefined,
    isActive:    true,
    platform:    'iqmetrix',
    metadata: strMap({ description: raw.Description, version: raw.Version }),
    raw,
  }
}
