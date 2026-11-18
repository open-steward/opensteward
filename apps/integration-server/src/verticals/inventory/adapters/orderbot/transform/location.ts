/**
 * Orderbot location (distribution centre) transform.
 *
 * Orderbot exposes warehouses/DCs.  The public API documents them as
 * "distribution centers".  Field names follow the snake_case REST convention
 * observed in the Orderbot API documentation.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawOrderbotLocation {
  id?: string | number
  name?: string
  code?: string
  short_code?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  zip?: string
  active?: boolean | string | number
  status?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawOrderbotLocation): Location {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code) ?? pickStr(raw.short_code),
    type: 'warehouse',
    address:
      raw.address1 || raw.city
        ? {
            line1: pickStr(raw.address1),
            line2: pickStr(raw.address2),
            city: pickStr(raw.city),
            region: pickStr(raw.state),
            country: pickStr(raw.country),
            postalCode: pickStr(raw.postal_code) ?? pickStr(raw.zip),
          }
        : undefined,
    isActive:
      pickBool(raw.active) ??
      (raw.status !== undefined ? raw.status.toString().toLowerCase() !== 'inactive' : true),
    platform: 'orderbot',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
