import type { Company } from '../../../schema/company'

/**
 * `Company` in the Keap REST v2 OpenAPI spec
 * (https://crm.infusionsoft.com/app/v3/api-docs/V2): `id`, `company_name`,
 * `website`, `phone_number` (`PhoneNumber`: `number`), `owner_id`,
 * `create_time`, `update_time`.
 */
export interface RawKeapCompany {
  id: string
  company_name: string
  website?: string
  phone_number?: { number?: string } | null
  owner_id?: string | null
  create_time?: string
  update_time?: string
  notes?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawKeapCompany): Company {
  return {
    id: String(raw.id),
    name: raw.company_name,
    domain: raw.website,
    phone: raw.phone_number?.number,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.create_time,
    updated_at: raw.update_time,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.company_name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone_number = { number: data.phone }
  return out
}
