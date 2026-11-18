import type { Contact } from '../../../schema/contact'

export interface RawWebcrmPerson {
  PersonId?: number
  PersonFirstName?: string
  PersonLastName?: string
  PersonEmail?: string
  PersonPhone?: string
  PersonMobile?: string
  OrganisationId?: number
  OwnedBy?: number
  PersonCreatedAt?: string
  PersonUpdatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawWebcrmPerson): Contact {
  return {
    id: String(raw.PersonId ?? ''),
    first_name: raw.PersonFirstName,
    last_name: raw.PersonLastName,
    name: [raw.PersonFirstName, raw.PersonLastName].filter(Boolean).join(' ') || undefined,
    email: raw.PersonEmail,
    phone: raw.PersonPhone,
    mobile: raw.PersonMobile,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    owner_id: raw.OwnedBy != null ? String(raw.OwnedBy) : undefined,
    created_at: raw.PersonCreatedAt,
    updated_at: raw.PersonUpdatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.PersonFirstName = data.first_name
  if (data.last_name !== undefined) out.PersonLastName = data.last_name
  if (data.email !== undefined) out.PersonEmail = data.email
  if (data.phone !== undefined) out.PersonPhone = data.phone
  if (data.mobile !== undefined) out.PersonMobile = data.mobile
  if (data.company_id !== undefined) out.OrganisationId = Number(data.company_id)
  return out
}
