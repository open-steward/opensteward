/**
 * Transform ChannelAdvisor DistributionCenter entity -> canonical Location.
 *
 * Endpoint: GET /v1/DistributionCenters
 *
 * Fields (from ChannelAdvisor Distribution Center entity):
 *   ID, ProfileID, Name, Code, IsActive, IsDefault
 *   Address fields: AddressLine1, AddressLine2, City, StateOrProvince, Country, PostalCode
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawChannelAdvisorDistributionCenter {
  ID: number | string
  ProfileID?: number | string
  Name?: string
  Code?: string
  IsActive?: boolean
  IsDefault?: boolean
  /** Street address fields */
  AddressLine1?: string
  AddressLine2?: string
  City?: string
  StateOrProvince?: string
  Country?: string
  PostalCode?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawChannelAdvisorDistributionCenter): Location {
  const id = String(raw.ID)
  const hasAddress =
    raw.AddressLine1 || raw.City || raw.StateOrProvince || raw.Country || raw.PostalCode

  return {
    id,
    externalId: id,
    name: pickStr(raw.Name) ?? '',
    code: pickStr(raw.Code),
    type: 'warehouse',
    parentLocationId: undefined,
    address: hasAddress
      ? {
          line1: pickStr(raw.AddressLine1),
          line2: pickStr(raw.AddressLine2),
          city: pickStr(raw.City),
          region: pickStr(raw.StateOrProvince),
          country: pickStr(raw.Country),
          postalCode: pickStr(raw.PostalCode),
        }
      : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    platform: 'channeladvisor',
    metadata: strMap({ isDefault: raw.IsDefault, profileId: raw.ProfileID }),
    raw,
  }
}
