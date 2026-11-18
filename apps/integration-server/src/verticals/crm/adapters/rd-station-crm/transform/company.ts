import type { Company } from '../../../schema/company'

export interface RawRdStationOrganization {
  _id: string
  name?: string
  phone?: string
  website?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawRdStationOrganization): Company {
  return {
    id: raw._id,
    name: raw.name ?? '',
    phone: raw.phone,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
