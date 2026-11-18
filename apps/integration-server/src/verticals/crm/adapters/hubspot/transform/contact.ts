import type { Contact } from '../../../schema/contact'

export interface RawHubSpotContact {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    phone?: string
    jobtitle?: string
    company?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

export function transformContact(
  raw: RawHubSpotContact,
  companyId?: string,
): Contact {
  return {
    id: String(raw.id),
    first_name: raw.properties.firstname ?? undefined,
    last_name: raw.properties.lastname ?? undefined,
    name: [raw.properties.firstname, raw.properties.lastname]
      .filter(Boolean)
      .join(' ') || undefined,
    email: raw.properties.email ?? undefined,
    phone: raw.properties.phone ?? undefined,
    title: raw.properties.jobtitle ?? undefined,
    company_id: companyId,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  if (data.first_name !== undefined) properties.firstname = data.first_name
  if (data.last_name !== undefined) properties.lastname = data.last_name
  if (data.email !== undefined) properties.email = data.email
  if (data.phone !== undefined) properties.phone = data.phone
  if (data.title !== undefined) properties.jobtitle = data.title
  return { properties }
}
