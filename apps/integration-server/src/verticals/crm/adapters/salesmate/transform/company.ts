import type { Company } from '../../../schema/company'
import { isoDate, refId, requireId, text, type SalesmateRef } from '../fields'

/**
 * A Salesmate v4 company. "Get a Company" (`GET /apis/company/v4/{id}`)
 * publishes no example body, so the fields are the ones the docs name for
 * this module: "name required String Name of the company", "phone optional
 * String Phone number 1 of the company" (Add a company), `company.owner.id`
 * and `company.createdAt` (Search a Company body), and `lastModifiedAt`
 * ("Order by will only work for the below fields: id, createdAt,
 * lastModifiedAt, name"). The related-record and timestamp shapes follow the
 * documented contact response.
 */
export interface RawSalesmateCompany {
  id?: number | string
  name?: string
  phone?: string
  website?: string
  owner?: SalesmateRef | null
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSalesmateCompany): Company {
  const name = text(raw.name)
  if (name === undefined) throw new Error('Salesmate company has no name')
  return {
    id: requireId(raw.id, 'company'),
    name,
    phone: text(raw.phone),
    owner_id: refId(raw.owner),
    created_at: isoDate(raw.createdAt),
    updated_at: isoDate(raw.lastModifiedAt),
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
