/**
 * Transform between Tribe CRM Activity_Note records and the canonical
 * CRM Note schema.
 *
 * Tribe CRM wire fields (PascalCase):
 *   Id              — unique identifier
 *   Subject         — note title / short description
 *   Description     — full note body text
 *   RelationId      — linked relation (contact) identifier
 *   OrganisationId  — linked organisation (company) identifier
 *   ActivityId      — linked activity / opportunity identifier
 *   OwnerId         — CRM user who authored the note
 *   CreatedOn       — ISO-8601 creation timestamp
 *   ModifiedOn      — ISO-8601 last-modified timestamp
 */
import type { Note } from '../../../schema/note'

export interface RawTribeCrmNote {
  Id: string | number
  Subject?: string
  Description?: string
  RelationId?: string | number | null
  OrganisationId?: string | number | null
  ActivityId?: string | number | null
  OwnerId?: string | number | null
  CreatedOn?: string
  ModifiedOn?: string
  [key: string]: unknown
}

export function transformNote(raw: RawTribeCrmNote): Note {
  const body = raw.Description ?? raw.Subject ?? ''
  return {
    id: String(raw.Id),
    content: body,
    contact_id: raw.RelationId != null ? String(raw.RelationId) : undefined,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    deal_id: raw.ActivityId != null ? String(raw.ActivityId) : undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    created_at: raw.CreatedOn ?? undefined,
    updated_at: raw.ModifiedOn ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Description = data.content
  if (data.contact_id !== undefined) out.RelationId = data.contact_id
  if (data.company_id !== undefined) out.OrganisationId = data.company_id
  if (data.deal_id !== undefined) out.ActivityId = data.deal_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
