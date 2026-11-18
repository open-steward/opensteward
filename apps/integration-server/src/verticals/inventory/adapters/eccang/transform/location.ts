/**
 * Transform ECCANG warehouse (仓库) records to the canonical Location schema.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawEccangLocation {
  warehouse_id?: string | number
  warehouse_code?: string
  warehouse_name?: string
  warehouse_type?: string
  is_enabled?: boolean | string | number
  is_default?: boolean | string | number
  country?: string
  province?: string
  city?: string
  address?: string
  zip_code?: string
  contact?: string
  phone?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawEccangLocation): Location {
  const id = String(raw.warehouse_id ?? raw.warehouse_code ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.warehouse_name) ?? '',
    code: pickStr(raw.warehouse_code),
    type: 'warehouse',
    address: (raw.address || raw.city || raw.country) ? {
      line1: pickStr(raw.address),
      city: pickStr(raw.city),
      region: pickStr(raw.province),
      country: pickStr(raw.country),
      postalCode: pickStr(raw.zip_code),
    } : undefined,
    isActive: pickBool(raw.is_enabled) ?? true,
    platform: 'eccang',
    metadata: strMap({
      warehouseType: raw.warehouse_type,
      isDefault: raw.is_default,
      contact: raw.contact,
      phone: raw.phone,
    }),
    raw,
  }
}
