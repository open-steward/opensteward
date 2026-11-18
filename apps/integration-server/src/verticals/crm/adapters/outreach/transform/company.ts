import type { Company } from '../../../schema/company'
import type { JsonApiResource } from '../client'

export interface RawOutreachCompanyAttributes {
  name?: string
  websiteUrl?: string
  phoneNumber?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type RawOutreachCompany = JsonApiResource<RawOutreachCompanyAttributes>

export function transformCompany(raw: RawOutreachCompany): Company {
  const attrs = raw.attributes

  const ownerRel = raw.relationships?.['owner']?.data
  const ownerId = ownerRel && !Array.isArray(ownerRel)
    ? String(ownerRel.id)
    : undefined

  return {
    id: String(raw.id),
    name: attrs.name ?? '',
    domain: attrs.websiteUrl,
    phone: attrs.phoneNumber,
    owner_id: ownerId,
    created_at: attrs.createdAt,
    updated_at: attrs.updatedAt,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  const relationships: Record<string, unknown> = {}

  if (data.name !== undefined) attributes['name'] = data.name
  if (data.domain !== undefined) attributes['websiteUrl'] = data.domain
  if (data.phone !== undefined) attributes['phoneNumber'] = data.phone

  if (data.owner_id !== undefined) {
    relationships['owner'] = { data: { type: 'user', id: data.owner_id } }
  }

  return {
    data: {
      type: 'account',
      attributes,
      ...(Object.keys(relationships).length > 0 ? { relationships } : {}),
    },
  }
}
