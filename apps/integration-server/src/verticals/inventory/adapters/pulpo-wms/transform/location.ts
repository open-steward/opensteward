import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Raw warehouse record from GET /api/v1/warehouses (PULPO WMS).
 * PULPO uses "warehouse" terminology; mapped to the canonical Location type.
 */
export interface RawPulpoWmsLocation {
  id: string
  name?: string
  code?: string
  type?: string
  is_active?: boolean | string
  is_default?: boolean | string
  parent_id?: string
  address?: {
    street?: string
    street2?: string
    city?: string
    state?: string
    country?: string
    zip?: string
    postal_code?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawPulpoWmsLocation): Location {
  const addr = raw.address
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: 'warehouse',
    parentLocationId: pickStr(raw.parent_id),
    address: addr ? {
      line1: addr.street,
      line2: addr.street2,
      city: addr.city,
      region: addr.state,
      country: addr.country,
      postalCode: addr.postal_code ?? addr.zip,
    } : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'pulpo-wms',
    metadata: strMap({
      is_default: raw.is_default,
      type: raw.type,
    }),
    raw,
  }
}
