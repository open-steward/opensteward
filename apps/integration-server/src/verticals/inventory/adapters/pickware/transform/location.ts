/**
 * Transform a raw Pickware warehouse object (GET /api/warehouses or GET /api/warehouses/{id})
 * into the canonical Location schema.
 *
 * Pickware warehouse response fields:
 *   id (integer), code (string), name (string),
 *   stockAvailableForSale (boolean), defaultWarehouse (boolean),
 *   defaultReturnShipmentWarehouse (boolean), nullBinLocationId (string),
 *   contact (string), email (string), phone (string), address (string), comment (string),
 *   binLocationFormatComponents (array)
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawPickwareWarehouse {
  id: number | string
  code?: string
  name?: string
  stockAvailableForSale?: boolean
  defaultWarehouse?: boolean
  defaultReturnShipmentWarehouse?: boolean
  nullBinLocationId?: string | number
  contact?: string
  email?: string
  phone?: string
  address?: string
  comment?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawPickwareWarehouse): Location {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: 'warehouse',
    isActive: true,
    platform: 'pickware',
    metadata: strMap({
      stockAvailableForSale: raw.stockAvailableForSale,
      defaultWarehouse: raw.defaultWarehouse,
      defaultReturnShipmentWarehouse: raw.defaultReturnShipmentWarehouse,
      contact: raw.contact,
      email: raw.email,
      phone: raw.phone,
      comment: raw.comment,
    }),
    raw,
  }
}
