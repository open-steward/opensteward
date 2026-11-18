import type { Company } from '../../../schema/company'
import { iso, requireId, requireText, text } from '../fields'

/**
 * A company as GET /qontak/crm/companies and GET /qontak/crm/companies/{id}
 * return it. Only the fields this transform reads are typed; every key is
 * from the documented 200 example in Qontak's CRM OpenAPI
 * (https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json).
 */
export interface RawQontakCompany {
  id: number | string
  name?: string | null
  telephone?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  zipcode?: string | null
  industry_name?: string | null
  number_of_employees?: number | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawQontakCompany): Company {
  const line1 = text(raw.address)
  const city = text(raw.city)
  const region = text(raw.province)
  const postalCode = text(raw.zipcode)
  const employees = raw.number_of_employees
  return {
    id: requireId(raw.id, 'company'),
    name: requireText(raw.name, 'company', 'name'),
    phone: text(raw.telephone),
    industry: text(raw.industry_name),
    size:
      typeof employees === 'number' && Number.isInteger(employees) && employees >= 0
        ? employees
        : undefined,
    // `country` is free text in the example (""), not an ISO 3166 code, so it
    // stays in metadata rather than being guessed into one.
    address:
      line1 || city || region || postalCode ? { line1, city, region, postalCode } : undefined,
    created_at: iso(raw.created_at),
    updated_at: iso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
