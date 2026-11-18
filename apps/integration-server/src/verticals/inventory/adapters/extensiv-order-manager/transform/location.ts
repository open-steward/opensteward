/**
 * Transform Extensiv Order Manager warehouse response → canonical Location.
 *
 * Real API: GET /api/v1/warehouses
 * Key fields: warehouseId, name, type, active, contactEmail, contactPhone,
 *             address { address1, address2, address3, city, state, zipCode, country }
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawExtensivWarehouse {
  warehouseId?: number | string | null
  name?: string | null
  type?: string | null
  active?: boolean | null
  salesChannelId?: number | string | null
  contactEmail?: string | null
  contactPhone?: string | null
  fax?: string | null
  address?: {
    address1?: string | null
    address2?: string | null
    address3?: string | null
    city?: string | null
    state?: string | null
    province?: string | null
    zipCode?: string | null
    country?: string | null
    type?: string | null
  } | null
  [key: string]: unknown
}

export function transformLocation(raw: RawExtensivWarehouse): Location {
  const id = String(raw.warehouseId ?? '')
  const addr = raw.address
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    type: 'warehouse',
    address: addr ? {
      line1: pickStr(addr.address1),
      line2: pickStr(addr.address2) ?? pickStr(addr.address3),
      city: pickStr(addr.city),
      region: pickStr(addr.state) ?? pickStr(addr.province),
      country: pickStr(addr.country),
      postalCode: pickStr(addr.zipCode),
    } : undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'extensiv-order-manager',
    metadata: strMap({
      type: raw.type,
      contactEmail: raw.contactEmail,
      contactPhone: raw.contactPhone,
      salesChannelId: raw.salesChannelId,
    }),
    raw,
  }
}
