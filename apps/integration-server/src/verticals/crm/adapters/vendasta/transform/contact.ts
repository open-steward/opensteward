/**
 * Contact transform: Vendasta CRM <-> OpenSteward canonical Contact.
 *
 * Vendasta field IDs (from the CRM OpenAPI spec):
 *   system__contact_id         — unique record ID (read-only)
 *   standard__first_name       — given name
 *   standard__last_name        — family name
 *   standard__email            — primary email
 *   standard__phone_number     — primary phone
 *   standard__contact_mobile_phone_number — mobile phone
 *   standard__contact_job_title           — job title
 *   standard__contact_primary_company_id  — linked company (read-only from platform)
 *   system__contact_owner_id              — owner user ID
 *   standard__contact_lifecycle_stage     — lifecycle stage (lead / customer / …)
 *   standard__tags             — comma-separated tags
 *   standard__contact_primary_location_city_locality
 *   standard__contact_primary_location_state_province_region
 *   standard__contact_primary_location_country
 *   standard__contact_primary_location_street_address_1
 *   standard__contact_primary_location_zip_postal_code
 *   system__contact_created    — ISO date (read-only)
 *   system__contact_updated    — ISO date (read-only)
 */

import type { Contact } from '../../../schema/contact'
import {
  type VendastaCrmObject,
  type VendastaFieldValue,
  getField,
  strField,
} from '../client'

export type RawVendastaContact = VendastaCrmObject

export function transformContact(raw: RawVendastaContact): Contact {
  const f = raw.fields ?? []
  const id = raw.crmObjectId ?? getField(f, 'system__contact_id') ?? ''
  const firstName = getField(f, 'standard__first_name')
  const lastName  = getField(f, 'standard__last_name')

  const name = [firstName, lastName].filter(Boolean).join(' ') || undefined

  const tagsRaw = getField(f, 'standard__tags')
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined

  const street1  = getField(f, 'standard__contact_primary_location_street_address_1')
  const city     = getField(f, 'standard__contact_primary_location_city_locality')
  const state    = getField(f, 'standard__contact_primary_location_state_province_region')
  const country  = getField(f, 'standard__contact_primary_location_country')
  const postCode = getField(f, 'standard__contact_primary_location_zip_postal_code')

  const address = (street1 || city || state || country || postCode)
    ? {
        line1: street1,
        city,
        region: state,
        country,
        postalCode: postCode,
      }
    : undefined

  return {
    id: String(id),
    first_name:  firstName,
    last_name:   lastName,
    name,
    email:       getField(f, 'standard__email'),
    phone:       getField(f, 'standard__phone_number'),
    mobile:      getField(f, 'standard__contact_mobile_phone_number'),
    title:       getField(f, 'standard__contact_job_title'),
    company_id:  getField(f, 'standard__contact_primary_company_id'),
    owner_id:    raw.ownerId ?? getField(f, 'system__contact_owner_id'),
    stage:       getField(f, 'standard__contact_lifecycle_stage'),
    tags,
    address,
    created_at:  raw.created,
    updated_at:  raw.updated,
    metadata:    raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): VendastaFieldValue[] {
  const fields: VendastaFieldValue[] = []
  const push = (fv: VendastaFieldValue | null) => { if (fv) fields.push(fv) }

  push(strField('standard__first_name', data.first_name ?? undefined))
  push(strField('standard__last_name',  data.last_name ?? undefined))
  push(strField('standard__email',       data.email ?? undefined))
  push(strField('standard__phone_number', data.phone ?? undefined))
  push(strField('standard__contact_mobile_phone_number', data.mobile ?? undefined))
  push(strField('standard__contact_job_title', data.title ?? undefined))
  push(strField('standard__contact_lifecycle_stage', data.stage ?? undefined))

  if (data.address) {
    push(strField('standard__contact_primary_location_street_address_1', data.address.line1 ?? undefined))
    push(strField('standard__contact_primary_location_city_locality',    data.address.city ?? undefined))
    push(strField('standard__contact_primary_location_state_province_region', data.address.region ?? undefined))
    push(strField('standard__contact_primary_location_country',          data.address.country ?? undefined))
    push(strField('standard__contact_primary_location_zip_postal_code',  data.address.postalCode ?? undefined))
  }

  if (data.tags && data.tags.length > 0) {
    push(strField('standard__tags', data.tags.join(',')))
  }

  return fields
}
