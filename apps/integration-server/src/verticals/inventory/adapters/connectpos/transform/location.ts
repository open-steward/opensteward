import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Shape returned by GET ?path=outlet (ConnectPOS SM_XRetail outlet management).
 *
 * An outlet is ConnectPOS's concept of a physical store / POS location.
 * Corresponds to the SM\Core\Api\Data\Outlet data object.
 */
export interface RawConnectposOutlet {
  /** Internal outlet id */
  id: string | number
  name?: string
  /** Magento store_id the outlet belongs to */
  store_id?: string | number
  is_active?: number | string | boolean
  /** Optional linked warehouse id */
  warehouse_id?: string | number
  /** Street address */
  street?: string
  city?: string
  /** Two-letter ISO country code */
  country_id?: string
  /** Region/state name or id */
  region_id?: string | number
  postcode?: string
  telephone?: string
  /** Latitude */
  lat?: string | number
  /** Longitude */
  lng?: string | number
  [key: string]: unknown
}

export function transformLocation(raw: RawConnectposOutlet): Location {
  const id = String(raw.id)
  const hasAddress = raw.street || raw.city || raw.country_id

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    code: undefined,
    type: 'store',
    address: hasAddress ? {
      line1: pickStr(raw.street),
      city: pickStr(raw.city),
      region: pickStr(String(raw.region_id ?? '')),
      country: pickStr(raw.country_id),
      postalCode: pickStr(raw.postcode),
    } : undefined,
    isActive: pickBool(raw.is_active) ?? true,
    platform: 'connectpos',
    metadata: strMap({
      storeId: raw.store_id,
      warehouseId: raw.warehouse_id,
      telephone: raw.telephone,
      lat: raw.lat,
      lng: raw.lng,
    }),
    raw,
  }
}
