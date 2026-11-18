import type { Company } from '../../../schema/company'
import { firstMeans, idOf, isoWithOffset, nonEmpty, requiredId } from '../fields'

/**
 * Scoro has no companies module: a company is a contact of contact_type
 * "company" (Contacts table at https://api.scoro.com/api/v2: contact_type
 * "possible values are \"person\" or \"company\"", name "contact first name or
 * company name"). Same fields as the person contact.
 */
export interface RawScoroCompany {
  contact_id?: number | string
  name?: string | null
  contact_type?: string
  manager_id?: number | string | null
  created_date?: string | null
  modified_date?: string | null
  means_of_contact?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformCompany(raw: RawScoroCompany): Company {
  const name = nonEmpty(raw.name)
  if (name === undefined) {
    throw Object.assign(new Error('Scoro company contact has no name'), {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  }
  return {
    id: requiredId(raw.contact_id, 'company contact'),
    name,
    phone: firstMeans(raw.means_of_contact, 'phone'),
    owner_id: idOf(raw.manager_id),
    created_at: isoWithOffset(raw.created_date),
    updated_at: isoWithOffset(raw.modified_date),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  return out
}
