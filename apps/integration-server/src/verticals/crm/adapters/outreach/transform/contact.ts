import type { Contact } from '../../../schema/contact'
import type { JsonApiResource } from '../client'

export interface RawOutreachContactAttributes {
  firstName?: string
  lastName?: string
  emails?: Array<{ email: string; order?: number }>
  phones?: Array<{ phone: string; order?: number }>
  title?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type RawOutreachContact = JsonApiResource<RawOutreachContactAttributes>

export function transformContact(raw: RawOutreachContact): Contact {
  const attrs = raw.attributes
  const email = attrs.emails?.[0]?.email
  const phone = attrs.phones?.[0]?.phone

  const accountRel = raw.relationships?.['account']?.data
  const companyId = accountRel && !Array.isArray(accountRel)
    ? String(accountRel.id)
    : undefined

  const ownerRel = raw.relationships?.['owner']?.data
  const ownerId = ownerRel && !Array.isArray(ownerRel)
    ? String(ownerRel.id)
    : undefined

  return {
    id: String(raw.id),
    first_name: attrs.firstName,
    last_name: attrs.lastName,
    name: [attrs.firstName, attrs.lastName].filter(Boolean).join(' ') || undefined,
    email,
    phone,
    title: attrs.title,
    company_id: companyId,
    owner_id: ownerId,
    created_at: attrs.createdAt,
    updated_at: attrs.updatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  const relationships: Record<string, unknown> = {}

  if (data.first_name !== undefined) attributes['firstName'] = data.first_name
  if (data.last_name !== undefined) attributes['lastName'] = data.last_name
  if (data.email !== undefined) attributes['emails'] = [{ email: data.email }]
  if (data.phone !== undefined) attributes['phones'] = [{ phone: data.phone }]
  if (data.title !== undefined) attributes['title'] = data.title

  if (data.company_id !== undefined) {
    relationships['account'] = { data: { type: 'account', id: data.company_id } }
  }
  if (data.owner_id !== undefined) {
    relationships['owner'] = { data: { type: 'user', id: data.owner_id } }
  }

  return {
    data: {
      type: 'prospect',
      attributes,
      ...(Object.keys(relationships).length > 0 ? { relationships } : {}),
    },
  }
}
