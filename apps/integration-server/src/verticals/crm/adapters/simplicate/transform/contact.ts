/**
 * Transforms between Simplicate CRM person objects and the canonical Contact schema.
 *
 * Simplicate person fields (from /crm/person):
 *   id            – "person:xxxxxxxxxxxxxxxx"
 *   first_name    – given name
 *   family_name   – surname
 *   email         – primary e-mail on the person record
 *   phone         – primary phone
 *   work_phone    – phone stored on contact-person link (optional)
 *   work_mobile   – mobile stored on contact-person link (optional)
 *   note          – free-text note
 *   created_at    – ISO 8601 datetime
 *   updated_at    – ISO 8601 datetime
 *   linked_as_contact_to_organization – array of org links
 *     [0].organization_id  – "organization:xxxxxxxxxxxxxxxx"
 *
 * Docs: https://developer.simplicate.com/docs/api/v2/reference/get-crm-person/
 */
import type { Contact } from '../../../schema/contact'

export interface RawSimplicateLinkedOrg {
  id?: string
  organization_id?: string
  work_email?: string
  work_phone?: string
  work_mobile?: string
  work_function?: string
  [key: string]: unknown
}

export interface RawSimplicatePerson {
  id: string
  first_name?: string
  family_name?: string
  email?: string
  phone?: string
  work_phone?: string
  work_mobile?: string
  note?: string
  created_at?: string
  updated_at?: string
  linked_as_contact_to_organization?: RawSimplicateLinkedOrg[]
  [key: string]: unknown
}

export function transformContact(raw: RawSimplicatePerson): Contact {
  const nameParts = [raw.first_name, raw.family_name].filter(Boolean)
  const linked = raw.linked_as_contact_to_organization?.[0]
  const companyId = linked?.organization_id
    ? String(linked.organization_id)
    : undefined

  // Phone: prefer work_phone on the org link, fall back to person-level phone
  const phone = linked?.work_phone ?? raw.work_phone ?? raw.phone
  const mobile = linked?.work_mobile ?? raw.work_mobile

  return {
    id: String(raw.id),
    first_name: raw.first_name ?? undefined,
    last_name: raw.family_name ?? undefined,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: raw.email ?? undefined,
    phone: phone ?? undefined,
    mobile: mobile ?? undefined,
    company_id: companyId,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.family_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
