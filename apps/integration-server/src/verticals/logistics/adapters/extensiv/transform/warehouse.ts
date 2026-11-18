import { z } from 'zod'
import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

/**
 * 3PL Warehouse Manager `GET /properties/facilities`.
 *
 * First-party source: the 3PL Central REST APIs Postman collection
 * (https://developer.3plcentral.com/api/collections/8399762/SVn3tFsv), request
 * "Facilities": "Returns a list of all facilities and their respective
 * details/properties".
 *
 * The documented example response:
 *   { totalResults: 1, _embedded: { "http://api.3plCentral.com/rels/properties/facility": [
 *     { facilityId, name, deactivated, usePredefinedLocations, code, upsAccount,
 *       fedExAccount, fuelSurcharge, locationFieldCount, measurementSystemDefault,
 *       lastCloseDate, freightRateLocationCode, timeZoneName, shippingZip,
 *       contact: { contactId, companyName, name, title, address1, address2, city,
 *                  state, zip, country, phoneNumber, fax, emailAddress, dept,
 *                  code, addressStatus },
 *       preventPartialOrderManualAllocation, rowVersion } ] } }
 *
 * `contact.country` and `timeZoneName` are documented only as "str": neither
 * is documented as ISO 3166 alpha-2 or an IANA zone, so neither is mapped (both
 * stay in `metadata`).
 */
export const FACILITY_REL = 'http://api.3plCentral.com/rels/properties/facility'

export interface ExtensivFacilityContact {
  contactId?: number | null
  companyName?: string | null
  name?: string | null
  title?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phoneNumber?: string | null
  fax?: string | null
  emailAddress?: string | null
  dept?: string | null
  code?: string | null
  addressStatus?: number | null
  [key: string]: unknown
}

export interface ExtensivFacility {
  facilityId?: number | null
  name?: string | null
  deactivated?: boolean | null
  code?: string | null
  timeZoneName?: string | null
  contact?: ExtensivFacilityContact | null
  [key: string]: unknown
}

export interface ExtensivFacilitiesResponse {
  totalResults?: number | null
  _embedded?: { [FACILITY_REL]?: ExtensivFacility[] | null } | null
  [key: string]: unknown
}

const nonEmpty = (v: string | null | undefined): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined

const Email = z.email()

function toAddress(c: ExtensivFacilityContact | null | undefined): Address | undefined {
  if (!c) return undefined
  const email = nonEmpty(c.emailAddress)
  const addr: Address = {
    name: nonEmpty(c.name),
    company: nonEmpty(c.companyName),
    street1: nonEmpty(c.address1),
    street2: nonEmpty(c.address2),
    city: nonEmpty(c.city),
    state: nonEmpty(c.state),
    postalCode: nonEmpty(c.zip),
    phone: nonEmpty(c.phoneNumber),
    email: email !== undefined && Email.safeParse(email).success ? email : undefined,
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

export function transformWarehouse(raw: ExtensivFacility): Warehouse {
  return {
    id: raw.facilityId != null ? String(raw.facilityId) : undefined,
    name: nonEmpty(raw.name),
    code: nonEmpty(raw.code),
    address: toAddress(raw.contact),
    isActive: typeof raw.deactivated === 'boolean' ? !raw.deactivated : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** The facilities of one `GET /properties/facilities` page. */
export function facilityRows(
  res: ExtensivFacilitiesResponse | null | undefined,
): ExtensivFacility[] {
  return res?._embedded?.[FACILITY_REL] ?? []
}
