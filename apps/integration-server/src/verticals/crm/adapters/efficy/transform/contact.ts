import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * `Contact_GET` / `Contact_GetByID` from
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (GET /api/v1/contacts, GET /api/v1/contacts/{id}). Only documented fields.
 */
export interface RawEfficyContact {
  crm_id?: string
  external_id?: string
  first_name?: string
  last_name?: string
  title?: string
  mail_address?: string
  phone?: string
  mobile_phone?: string
  job_title?: string
  company?: { crm_id?: string; external_id?: string; name?: string }
  address_building?: string
  address_country?: string
  address_district?: string
  address_house_number?: string
  address_name?: string
  address_postcode?: string
  address_road?: string
  address_state?: string
  creation_date?: string
  last_update_date?: string
  [key: string]: unknown
}

function address(raw: RawEfficyContact): Contact['address'] {
  const line1 = [raw.address_road, raw.address_house_number].filter(Boolean).join(' ') || undefined
  const country =
    raw.address_country && isIso3166Alpha2(raw.address_country) ? raw.address_country : undefined
  const out = {
    line1,
    line2: raw.address_building || undefined,
    region: raw.address_state || undefined,
    postalCode: raw.address_postcode || undefined,
    country,
  }
  return Object.values(out).some((v) => v !== undefined) ? out : undefined
}

export function transformContact(raw: RawEfficyContact): Contact {
  if (!raw.crm_id) throw new Error('Efficy contact has no crm_id')
  return {
    id: raw.crm_id,
    first_name: raw.first_name,
    last_name: raw.last_name,
    email: raw.mail_address || undefined,
    phone: raw.phone || undefined,
    mobile: raw.mobile_phone || undefined,
    title: raw.job_title || undefined,
    company_id: raw.company?.crm_id || undefined,
    address: address(raw),
    created_at: raw.creation_date,
    updated_at: raw.last_update_date,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FIRSTNAME = data.first_name
  if (data.last_name !== undefined) out.NAME = data.last_name
  if (data.email !== undefined) out.EMAIL = data.email
  if (data.phone !== undefined) out.PHONE = data.phone
  if (data.mobile !== undefined) out.MOBILE = data.mobile
  if (data.company_id !== undefined) out.K_COMPANY = Number(data.company_id)
  return out
}
