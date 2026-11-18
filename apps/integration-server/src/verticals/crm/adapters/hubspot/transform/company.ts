import type { Company } from '../../../schema/company'

export interface RawHubSpotCompany {
  id: string
  properties: {
    name?: string
    domain?: string
    phone?: string
    description?: string
    numberofemployees?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

export function transformCompany(raw: RawHubSpotCompany): Company {
  const sizeRaw = raw.properties.numberofemployees
  const size = sizeRaw != null ? parseInt(sizeRaw, 10) : undefined

  return {
    id: String(raw.id),
    name: raw.properties.name ?? '',
    domain: raw.properties.domain ?? undefined,
    phone: raw.properties.phone ?? undefined,
    size: size != null && !isNaN(size) ? size : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  if (data.name !== undefined) properties.name = data.name
  if (data.domain !== undefined) properties.domain = data.domain
  if (data.phone !== undefined) properties.phone = data.phone
  if (data.size !== undefined) properties.numberofemployees = String(data.size)
  return { properties }
}
