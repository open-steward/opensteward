import type { Contact } from '../../../schema/contact'

// Brevo contact — attributes is a key/value map of contact attributes
export interface RawBrevoContact {
  id?: number
  email?: string
  attributes?: {
    FIRSTNAME?: string
    LASTNAME?: string
    SMS?: string
    [key: string]: unknown
  }
  linkedCompaniesIds?: string[]
  listIds?: number[]
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawBrevoContact): Contact {
  const firstName = raw.attributes?.FIRSTNAME
  const lastName = raw.attributes?.LASTNAME
  return {
    id: String(raw.id ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.attributes?.SMS as string | undefined,
    company_id: raw.linkedCompaniesIds?.[0],
    created_at: raw.createdAt,
    updated_at: raw.modifiedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.email !== undefined) out.email = data.email
  const attrs: Record<string, unknown> = {}
  if (data.first_name !== undefined) attrs.FIRSTNAME = data.first_name
  if (data.last_name !== undefined) attrs.LASTNAME = data.last_name
  if (data.phone !== undefined) attrs.SMS = data.phone
  if (Object.keys(attrs).length > 0) out.attributes = attrs
  return out
}
