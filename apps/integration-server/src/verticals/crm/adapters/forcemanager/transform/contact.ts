import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import { refId, requireId, text, type ValueRef } from '../refs'

/**
 * ForceManager Contact, as documented by GET /contacts and GET /contacts/{ID}
 * (https://developer.forcemanager.com/openapi.json, "List of the supported
 * Contacts attributes"). Only the attributes this transform reads are typed.
 */
export interface RawForceManagerContact {
  id?: number | string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone1?: string | null
  accountId?: ValueRef | null
  salesRepId?: ValueRef | null
  address1?: string | null
  city?: string | null
  region?: string | null
  postcode?: string | null
  dateCreated?: string | null
  dateUpdated?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawForceManagerContact): Contact {
  const firstName = text(raw.firstName)
  const lastName = text(raw.lastName)
  const line1 = text(raw.address1)
  const city = text(raw.city)
  const region = text(raw.region)
  const postalCode = text(raw.postcode)
  return {
    id: requireId(raw, 'contact'),
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    email: text(raw.email),
    // "phone1 | String | Contact's first phone number"
    phone: text(raw.phone1),
    company_id: refId(raw.accountId),
    owner_id: refId(raw.salesRepId),
    // countryId.value is a localised country name ("United States"), not ISO 3166-1, so no country.
    address:
      line1 || city || region || postalCode ? { line1, city, region, postalCode } : undefined,
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateUpdated),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.cellPhone = data.mobile
  if (data.company_id !== undefined) out.accountId = data.company_id
  return out
}
