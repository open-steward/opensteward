/**
 * Transform a raw Jushuitan warehouse record (/open/wms/partner/query) into a
 * canonical Location.
 *
 * Jushuitan field reference:
 *   wms_co_id   — numeric warehouse ID
 *   wms_name    — warehouse display name
 *   short_name  — warehouse short code
 *   enabled     — 1 = active
 *   province    — province/region
 *   city        — city
 *   county      — district/county
 *   address     — street address
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawJushuitanLocation {
  wms_co_id: number | string
  wms_name?: string
  short_name?: string
  enabled?: number | string | boolean
  province?: string
  city?: string
  county?: string
  address?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawJushuitanLocation): Location {
  const id = String(raw.wms_co_id)

  // Build address from component fields when available
  const hasAddress = raw.province || raw.city || raw.county || raw.address
  const addressObj = hasAddress
    ? {
        line1: pickStr(raw.address),
        city: pickStr(raw.city),
        region: pickStr(raw.province),
        postalCode: undefined,
        country: 'CN',
      }
    : undefined

  return {
    id,
    externalId: id,
    name: pickStr(raw.wms_name) ?? '',
    code: pickStr(raw.short_name),
    type: 'warehouse',
    address: addressObj,
    isActive: pickBool(raw.enabled) ?? true,
    platform: 'jushuitan',
    metadata: strMap({ county: raw.county }),
    raw,
  }
}
