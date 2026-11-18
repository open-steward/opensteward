/**
 * AdvancePro location / warehouse transform.
 *
 * GET /api/Warehouses returns warehouse records.
 *
 * Known response fields:
 *   id, name, code, isDefault, isActive,
 *   address1, address2, city, state, country, postalCode
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawAdvanceProWarehouse {
  id?: string | number
  name?: string
  code?: string
  shortCode?: string
  isDefault?: boolean | string | number
  isActive?: boolean | string | number
  active?: boolean | string | number
  address1?: string
  address2?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  zip?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawAdvanceProWarehouse): Location {
  const externalId = String(raw.id ?? '')
  return {
    id: externalId,
    externalId,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code ?? raw.shortCode),
    type: 'warehouse',
    address: raw.address1 || raw.city
      ? {
          line1: pickStr(raw.address1),
          line2: pickStr(raw.address2),
          city: pickStr(raw.city),
          region: pickStr(raw.state),
          country: pickStr(raw.country),
          postalCode: pickStr(raw.postalCode ?? raw.zip),
        }
      : undefined,
    isActive: pickBool(raw.isActive ?? raw.active) ?? true,
    platform: 'advance-pro',
    metadata: strMap({ isDefault: raw.isDefault }),
    raw,
  }
}
