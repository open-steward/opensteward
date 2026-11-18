/**
 * Transform Ongoing WMS goodsOwner response → canonical Location.
 *
 * The Goods Owner REST API does not expose warehouse bin locations for
 * external integrators. The closest concept is the "goodsOwner" entity,
 * which represents the logical customer account within the warehouse.
 *
 * GET /goodsOwners returns a list of goods owner accounts.
 * We map each to a Location of type "warehouse".
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawOngoingWmsGoodsOwner {
  goodsOwnerId?: number
  goodsOwnerName?: string
  /** Some responses include contact / address info */
  address?: {
    address1?: string
    address2?: string
    postCode?: string
    city?: string
    countryCode?: string
  }
  [key: string]: unknown
}

export function transformLocation(raw: RawOngoingWmsGoodsOwner): Location {
  const id = String(raw.goodsOwnerId ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.goodsOwnerName) ?? '',
    code: id,
    type: 'warehouse',
    parentLocationId: undefined,
    address: raw.address
      ? {
          line1: raw.address.address1,
          line2: raw.address.address2,
          city: raw.address.city,
          region: undefined,
          country: raw.address.countryCode,
          postalCode: raw.address.postCode,
        }
      : undefined,
    isActive: true,
    platform: 'ongoing-wms',
    metadata: strMap({}),
    raw,
  }
}
