/**
 * Supy "branch" → canonical Location transform.
 *
 * Supy organises restaurants into branches within brands/groups. Each branch
 * is the atomic stock-holding location. The API may also return storage areas
 * inside a branch; both are modelled as locations with type 'warehouse'.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawSupyBranch {
  id: string
  name?: string
  code?: string
  brandId?: string
  brandName?: string
  isActive?: boolean | string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    country?: string
    postalCode?: string
    zipCode?: string
  }
  timezone?: string
  currency?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawSupyBranch): Location {
  const addr = raw.address
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    code: pickStr(raw.code),
    type: 'warehouse',
    parentLocationId: pickStr(raw.brandId),
    address: addr ? {
      line1: pickStr(addr.line1),
      line2: pickStr(addr.line2),
      city: pickStr(addr.city),
      region: pickStr(addr.state),
      country: pickStr(addr.country),
      postalCode: pickStr(addr.postalCode ?? addr.zipCode),
    } : undefined,
    isActive: pickBool(raw.isActive) ?? true,
    platform: 'supy',
    metadata: strMap({
      brandId: raw.brandId,
      brandName: raw.brandName,
      timezone: raw.timezone,
      currency: raw.currency,
    }),
    raw,
  }
}
