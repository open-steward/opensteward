/**
 * noCRM.io Client Folder → canonical Company transform.
 *
 * noCRM.io exposes client folders (recurring-client containers) via:
 *   GET  /clients          — list all client folders
 *   GET  /clients/{id}     — retrieve one (includes extended_info)
 *   POST /clients          — create
 *   PUT  /clients/{id}     — update
 *   DELETE /clients/{id}   — delete
 *
 * Docs: https://www.nocrm.io/api#clients
 *
 * Wire shape (GET /clients/{id}):
 *   id, name, description, is_active, created_at, user_id,
 *   extended_info.fields (email, phone, address, web, city, zipcode, state, country)
 *   extended_info.user (owner details)
 */

import type { Company } from '../../../schema/company'

export interface RawNocrmClientExtendedFields {
  email?: string | null
  phone?: string | null
  mobile?: string | null
  address?: string | null
  web?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  job?: string | null
  fax?: string | null
  vat?: string | null
  city?: string | null
  zipcode?: string | null
  state?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawNocrmClientExtendedInfo {
  permalink?: string | null
  fields?: RawNocrmClientExtendedFields | null
  fields_by_name?: Record<string, unknown> | null
  user?: {
    id?: number | string | null
    lastname?: string | null
    firstname?: string | null
    email?: string | null
    phone?: string | null
    mobile_phone?: string | null
  } | null
}

export interface RawNocrmClient {
  id: number | string
  name: string
  description?: string | null
  is_active?: boolean | null
  created_at?: string | null
  /** Owner user id (top-level, always present in list response) */
  user_id?: number | string | null
  /** Only present in single-record GET /clients/{id} */
  extended_info?: RawNocrmClientExtendedInfo | null
  [key: string]: unknown
}

export function transformCompany(raw: RawNocrmClient): Company {
  const fields = raw.extended_info?.fields

  // Build address from extended_info.fields if available
  let address: Company['address'] | undefined
  if (fields) {
    const hasAddressData =
      fields.address || fields.city || fields.zipcode || fields.state || fields.country
    if (hasAddressData) {
      address = {
        line1: fields.address ?? null,
        city: fields.city ?? null,
        region: fields.state ?? null,
        postalCode: fields.zipcode ?? null,
        country: fields.country ?? null,
      }
    }
  }

  // Resolve owner_id: prefer extended_info.user.id, fall back to top-level user_id
  const ownerId =
    raw.extended_info?.user?.id != null
      ? String(raw.extended_info.user.id)
      : raw.user_id != null
        ? String(raw.user_id)
        : undefined

  return {
    id: String(raw.id),
    name: raw.name,
    domain: fields?.web ?? undefined,
    phone: fields?.phone ?? fields?.mobile ?? undefined,
    owner_id: ownerId,
    address,
    created_at: raw.created_at ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  // Build extended_info.fields for phone/domain/address when creating/updating
  const fields: Record<string, unknown> = {}
  if (data.phone !== undefined) fields['phone'] = data.phone
  if (data.domain !== undefined) fields['web'] = data.domain
  if (data.address) {
    if (data.address.line1 !== undefined) fields['address'] = data.address.line1
    if (data.address.city !== undefined) fields['city'] = data.address.city
    if (data.address.region !== undefined) fields['state'] = data.address.region
    if (data.address.postalCode !== undefined) fields['zipcode'] = data.address.postalCode
    if (data.address.country !== undefined) fields['country'] = data.address.country
  }
  if (Object.keys(fields).length > 0) {
    out['extended_info'] = { fields }
  }
  return out
}
