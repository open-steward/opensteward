/**
 * Transform Texada CloudLink branch/depot records into the canonical
 * Location schema.
 *
 * Texada calls these "Branches" — each is a physical depot or yard
 * from which equipment is rented out and returned.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawTexadaLocation {
  /** Branch identifier (e.g. "001", "NYC") */
  branchId?: string
  branchNo?: string
  id?: string
  /** Branch display name */
  branchName?: string
  name?: string
  /** Short code used on rental documents */
  branchCode?: string
  shortCode?: string
  code?: string
  /** Whether this is the default/headquarters branch */
  isDefault?: boolean | string
  isHeadquarters?: boolean | string
  /** Active flag */
  active?: boolean | string
  status?: string
  /** Parent branch (for multi-level depot hierarchies) */
  parentBranchId?: string
  /** Address fields */
  address1?: string
  address2?: string
  city?: string
  state?: string
  province?: string
  country?: string
  postalCode?: string
  zip?: string
  /** Phone / contact */
  phone?: string
  email?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawTexadaLocation): Location {
  const id = pickStr(raw.branchId ?? raw.branchNo ?? raw.id) ?? ''
  const name = pickStr(raw.branchName ?? raw.name) ?? ''
  const code = pickStr(raw.branchCode ?? raw.shortCode ?? raw.code)
  const parentLocationId = pickStr(raw.parentBranchId)

  const isActive = raw.active !== undefined
    ? pickBool(raw.active) ?? true
    : (raw.status ?? '').toLowerCase() !== 'inactive'

  const isDefault = pickBool(raw.isDefault ?? raw.isHeadquarters) ?? false

  const line1 = pickStr(raw.address1)
  const line2 = pickStr(raw.address2)
  const city = pickStr(raw.city)
  const region = pickStr(raw.state ?? raw.province)
  const country = pickStr(raw.country)
  const postalCode = pickStr(raw.postalCode ?? raw.zip)

  const hasAddress = line1 || city || country
  const address = hasAddress ? { line1, line2, city, region, country, postalCode } : undefined

  return {
    id,
    externalId: id,
    name,
    code,
    type: 'warehouse',
    parentLocationId,
    address,
    isActive,
    platform: 'texada',
    metadata: strMap({
      isDefault: isDefault,
      phone: raw.phone,
      email: raw.email,
    }),
    raw,
  }
}
