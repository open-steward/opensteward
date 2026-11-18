/**
 * Company transform: Vendasta CRM <-> OpenSteward canonical Company.
 *
 * Vendasta field IDs used:
 *   system__company_id                                  — unique record ID (read-only)
 *   standard__company_name                              — company name
 *   standard__company_website                           — primary website URL
 *   standard__company_phone_number                      — primary phone
 *   standard__company_number_of_employees               — headcount
 *   system__company_owner_id                            — owner user ID
 *   standard__company_tags                              — comma-separated tags
 *   standard__company_primary_location_street_address_1 — street address
 *   standard__company_primary_location_city_locality    — city
 *   standard__company_primary_location_state_province_region — state
 *   standard__company_primary_location_country          — country
 *   standard__company_primary_location_zip_postal_code  — zip / postal code
 *   system__company_created                             — ISO datetime (read-only)
 *   system__company_updated                             — ISO datetime (read-only)
 */

import type { Company } from '../../../schema/company'
import {
  type VendastaCrmObject,
  type VendastaFieldValue,
  getField,
  getFieldNumber,
  strField,
} from '../client'

export type RawVendastaCompany = VendastaCrmObject

export function transformCompany(raw: RawVendastaCompany): Company {
  const f = raw.fields ?? []
  const id = raw.crmObjectId ?? getField(f, 'system__company_id') ?? ''

  const sizeRaw = getFieldNumber(f, 'standard__company_number_of_employees')

  const tagsRaw = getField(f, 'standard__company_tags')
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined

  const street1  = getField(f, 'standard__company_primary_location_street_address_1')
  const city     = getField(f, 'standard__company_primary_location_city_locality')
  const state    = getField(f, 'standard__company_primary_location_state_province_region')
  const country  = getField(f, 'standard__company_primary_location_country')
  const postCode = getField(f, 'standard__company_primary_location_zip_postal_code')

  const address = (street1 || city || state || country || postCode)
    ? { line1: street1, city, region: state, country, postalCode: postCode }
    : undefined

  const websiteRaw = getField(f, 'standard__company_website')
  let domain: string | undefined
  if (websiteRaw) {
    try {
      domain = new URL(websiteRaw).hostname.replace(/^www\./, '')
    } catch {
      domain = websiteRaw
    }
  }

  return {
    id: String(id),
    name:      getField(f, 'standard__company_name') ?? '',
    domain,
    phone:     getField(f, 'standard__company_phone_number'),
    size:      sizeRaw != null && !isNaN(sizeRaw) ? Math.round(sizeRaw) : undefined,
    owner_id:  raw.ownerId ?? getField(f, 'system__company_owner_id'),
    tags,
    address,
    created_at: raw.created,
    updated_at: raw.updated,
    metadata:   raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): VendastaFieldValue[] {
  const fields: VendastaFieldValue[] = []
  const push = (fv: VendastaFieldValue | null) => { if (fv) fields.push(fv) }

  push(strField('standard__company_name',        data.name))
  push(strField('standard__company_website',     data.domain ?? undefined))
  push(strField('standard__company_phone_number', data.phone ?? undefined))

  if (data.size !== undefined) {
    push(strField('standard__company_number_of_employees', String(data.size)))
  }

  if (data.address) {
    push(strField('standard__company_primary_location_street_address_1', data.address.line1 ?? undefined))
    push(strField('standard__company_primary_location_city_locality',    data.address.city ?? undefined))
    push(strField('standard__company_primary_location_state_province_region', data.address.region ?? undefined))
    push(strField('standard__company_primary_location_country',          data.address.country ?? undefined))
    push(strField('standard__company_primary_location_zip_postal_code',  data.address.postalCode ?? undefined))
  }

  if (data.tags && data.tags.length > 0) {
    push(strField('standard__company_tags', data.tags.join(',')))
  }

  return fields
}
