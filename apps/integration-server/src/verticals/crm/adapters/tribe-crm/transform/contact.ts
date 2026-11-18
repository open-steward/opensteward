/**
 * Transform between Tribe CRM Relation (person) records and the canonical
 * CRM Contact schema.
 *
 * Tribe CRM wire fields (PascalCase):
 *   Id              — unique identifier
 *   FirstName       — given name
 *   LastName        — family / surname
 *   EmailAddress    — primary email
 *   PhoneNumber     — primary phone
 *   MobileNumber    — mobile phone
 *   JobTitle        — job title / function
 *   OrganisationId  — linked organisation identifier
 *   OwnerId         — CRM user responsible for this record
 *   CreatedOn       — ISO-8601 creation timestamp
 *   ModifiedOn      — ISO-8601 last-modified timestamp
 */
import type { Contact } from '../../../schema/contact'

export interface RawTribeCrmRelation {
  Id: string | number
  FirstName?: string
  LastName?: string
  EmailAddress?: string
  PhoneNumber?: string
  MobileNumber?: string
  JobTitle?: string
  OrganisationId?: string | number | null
  OwnerId?: string | number | null
  CreatedOn?: string
  ModifiedOn?: string
  [key: string]: unknown
}

export function transformContact(raw: RawTribeCrmRelation): Contact {
  const nameParts = [raw.FirstName, raw.LastName].filter(Boolean)
  return {
    id: String(raw.Id),
    first_name: raw.FirstName ?? undefined,
    last_name: raw.LastName ?? undefined,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: raw.EmailAddress ?? undefined,
    phone: raw.PhoneNumber ?? undefined,
    mobile: raw.MobileNumber ?? undefined,
    title: raw.JobTitle ?? undefined,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    created_at: raw.CreatedOn ?? undefined,
    updated_at: raw.ModifiedOn ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.EmailAddress = data.email
  if (data.phone !== undefined) out.PhoneNumber = data.phone
  if (data.mobile !== undefined) out.MobileNumber = data.mobile
  if (data.title !== undefined) out.JobTitle = data.title
  if (data.company_id !== undefined) out.OrganisationId = data.company_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
