import type { Company } from '../../../schema/company'

export interface RawBrevoCompany {
  id?: string
  // There is no top-level `name` on a Brevo company — it, like `domain`, is a
  // company attribute under `attributes`.
  attributes?: {
    name?: string
    domain?: string
    phone_number?: string
    industry?: string
    [key: string]: unknown
  }
  linkedContactsIds?: number[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawBrevoCompany): Company {
  return {
    id: String(raw.id ?? ''),
    name: raw.attributes?.name ?? '',
    phone: raw.attributes?.phone_number as string | undefined,
    domain: raw.attributes?.domain as string | undefined,
    industry: raw.attributes?.industry as string | undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const attrs: Record<string, unknown> = {}
  if (data.name !== undefined) attrs.name = data.name
  if (data.phone !== undefined) attrs.phone_number = data.phone
  if (data.domain !== undefined) attrs.domain = data.domain
  if (data.industry !== undefined) attrs.industry = data.industry
  if (Object.keys(attrs).length > 0) out.attributes = attrs
  return out
}
