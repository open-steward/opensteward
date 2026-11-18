import type { Contact } from '../../../schema/contact'

/**
 * `Contact` in the Keap REST v2 OpenAPI spec
 * (https://crm.infusionsoft.com/app/v3/api-docs/V2): `id`, `given_name`,
 * `family_name`, `email_addresses` (`EmailAddress`: `email`), `phone_numbers`
 * (`PhoneNumber`: `number`), `job_title`, `company` (`BasicCompany`: `id`),
 * `owner_id`, `create_time`, `update_time`.
 */
export interface RawKeapContact {
  id: string
  given_name?: string
  family_name?: string
  email_addresses?: Array<{ email: string; field?: string }>
  phone_numbers?: Array<{ number: string; field?: string }>
  job_title?: string
  company?: { id?: string; company_name?: string } | null
  owner_id?: string | null
  create_time?: string
  update_time?: string
  [key: string]: unknown
}

export function transformContact(raw: RawKeapContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.given_name,
    last_name: raw.family_name,
    email: raw.email_addresses?.[0]?.email,
    phone: raw.phone_numbers?.[0]?.number,
    title: raw.job_title,
    company_id: raw.company?.id != null ? String(raw.company.id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.create_time,
    updated_at: raw.update_time,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.given_name = data.first_name
  if (data.last_name !== undefined) out.family_name = data.last_name
  if (data.email !== undefined) {
    out.email_addresses = [{ email: data.email, field: 'EMAIL1' }]
  }
  if (data.phone !== undefined) {
    out.phone_numbers = [{ number: data.phone, field: 'PHONE1' }]
  }
  if (data.title !== undefined) out.job_title = data.title
  if (data.company_id !== undefined) out.company = { id: Number(data.company_id) }
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
