/**
 * Transform Restaurant365 OData `Location` entity -> canonical Location.
 *
 * R365 OData schema (https://odata.restaurant365.net/api/v2/views/Location):
 *   locationId          Guid
 *   name                String — location display name
 *   locationNumber      String — short code / number
 *   legalEntityId       Guid
 *   legalEntityNumber   String
 *   legalEntityName     String
 *   attribute1Id        Guid
 *   attribute1Number    String
 *   attribute1Name      String
 *   attribute2Id        Guid
 *   attribute2Number    String
 *   attribute2Name      String
 *   createdBy           String
 *   createdOn           DateTimeOffset
 *   modifiedBy          String
 *   modifiedOn          DateTimeOffset
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawR365Location {
  locationId: string
  name?: string
  locationNumber?: string
  legalEntityId?: string
  legalEntityNumber?: string
  legalEntityName?: string
  attribute1Id?: string
  attribute1Number?: string
  attribute1Name?: string
  attribute2Id?: string
  attribute2Number?: string
  attribute2Name?: string
  createdBy?: string
  createdOn?: string
  modifiedBy?: string
  modifiedOn?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawR365Location): Location {
  return {
    id: raw.locationId,
    externalId: raw.locationId,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.locationNumber),
    type: 'store',
    parentLocationId: pickStr(raw.legalEntityId),
    address: undefined,
    isActive: true,
    platform: 'restaurant365',
    metadata: strMap({
      legalEntityId: raw.legalEntityId,
      legalEntityNumber: raw.legalEntityNumber,
      legalEntityName: raw.legalEntityName,
      attribute1Name: raw.attribute1Name,
      attribute2Name: raw.attribute2Name,
      createdBy: raw.createdBy,
      modifiedBy: raw.modifiedBy,
    }),
    raw,
  }
}
