import type { Note } from '../../../schema/note'

export interface RawWebcrmNote {
  NoteId?: number
  NoteContent?: string
  PersonId?: number
  OrganisationId?: number
  OpportunityId?: number
  OwnedBy?: number
  NoteCreatedAt?: string
  NoteUpdatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawWebcrmNote): Note {
  return {
    id: String(raw.NoteId ?? ''),
    content: raw.NoteContent ?? '',
    contact_id: raw.PersonId != null ? String(raw.PersonId) : undefined,
    company_id: raw.OrganisationId != null ? String(raw.OrganisationId) : undefined,
    deal_id: raw.OpportunityId != null ? String(raw.OpportunityId) : undefined,
    owner_id: raw.OwnedBy != null ? String(raw.OwnedBy) : undefined,
    created_at: raw.NoteCreatedAt,
    updated_at: raw.NoteUpdatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.NoteContent = data.content
  if (data.contact_id !== undefined) out.PersonId = Number(data.contact_id)
  if (data.company_id !== undefined) out.OrganisationId = Number(data.company_id)
  if (data.deal_id !== undefined) out.OpportunityId = Number(data.deal_id)
  return out
}
