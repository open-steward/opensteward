/**
 * Kladana warehouse/location transform.
 *
 * Source: /entity/store
 * Key fields:
 *   id         — UUID
 *   name       — warehouse name
 *   code       — short reference code
 *   archived   — true = inactive
 *   address    — object with street, city, region, country, postalCode sub-fields
 *   pathName   — parent path (parent store names)
 *   externalCode — external reference
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

interface KladanaAddress {
  street?: string
  city?: string
  region?: string
  country?: string
  postalCode?: string
  [key: string]: unknown
}

export interface RawKladanaLocation {
  id: string
  name?: string
  code?: string
  externalCode?: string
  archived?: boolean
  address?: KladanaAddress
  pathName?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawKladanaLocation): Location {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: 'warehouse',
    address: raw.address ? {
      line1: raw.address.street,
      city: raw.address.city,
      region: raw.address.region,
      country: raw.address.country,
      postalCode: raw.address.postalCode,
    } : undefined,
    isActive: !(raw.archived ?? false),
    platform: 'kladana',
    metadata: strMap({ externalCode: raw.externalCode, pathName: raw.pathName }),
    raw,
  }
}
