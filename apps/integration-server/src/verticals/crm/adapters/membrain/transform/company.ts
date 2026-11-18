import type { Company } from '../../../schema/company'
import { guid, required, text } from '../fields'

/**
 * A Company as GET /companies/ and GET /companies/{Id} return it
 * (https://www.membrain.com/developers/api-documentation, "GET /companies/"
 * Example Result). `SalesPersonId` is the Account Manager: "SalesPersonId ...
 * The result will return only Companies where the Account Manager is one of
 * the provided Users."
 */
export interface RawMembrainCompany {
  Id: string
  Name: string
  Phone?: string
  SalesPersonId?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawMembrainCompany): Company {
  return {
    id: required(raw.Id, 'Id', 'company'),
    name: required(raw.Name, 'Name', 'company'),
    phone: text(raw.Phone),
    owner_id: guid(raw.SalesPersonId),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.domain = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  return out
}
