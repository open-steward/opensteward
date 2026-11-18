import type { Location } from '../../../schema/location'
import { pickStr, strMap } from './shared'

/**
 * Mintsoft warehouse record as returned by GET /api/Warehouse.
 *
 * Field names are properties of the `Warehouse` definition in the first-party
 * Swagger 2.0 spec (https://api.mintsoft.co.uk/swagger/docs/v1), which lists
 * `"required":["Name","AddressLine1","City","PostCode",...]` and types
 * `"Active":{"type":"boolean"}`. Address uses AddressLine1/AddressLine2, City
 * (not Town), PostCode.
 */
export interface RawMintsoftWarehouse {
  ID: number
  Name?: string
  Code?: string
  Active?: boolean
  AddressLine1?: string
  AddressLine2?: string
  City?: string
  County?: string
  PostCode?: string
  CountryId?: number
  [key: string]: unknown
}

export function transformLocation(raw: RawMintsoftWarehouse): Location {
  const idStr = String(raw.ID)
  const name = pickStr(raw.Name)
  if (!name) throw new Error(`mintsoft warehouse ${idStr} has no Name`)
  if (typeof raw.Active !== 'boolean') {
    throw new Error(`mintsoft warehouse ${idStr} has no Active flag`)
  }
  return {
    id: idStr,
    externalId: idStr,
    name,
    code: pickStr(raw.Code),
    type: 'warehouse',
    parentLocationId: undefined,
    address:
      raw.AddressLine1 || raw.City || raw.PostCode
        ? {
            line1: raw.AddressLine1,
            line2: raw.AddressLine2,
            city: raw.City,
            region: raw.County,
            country: undefined,
            postalCode: raw.PostCode,
          }
        : undefined,
    isActive: raw.Active,
    platform: 'mintsoft',
    metadata: strMap({}),
    raw,
  }
}
