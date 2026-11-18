/**
 * Transforms between Simplicate timeline/note messages and the canonical Note schema.
 *
 * Simplicate does not have a dedicated "note" resource. The closest equivalent
 * is a timeline message (POST /timeline/message). For reading notes we map
 * the note field on person and organization records via this helper.
 *
 * When notes are fetched as standalone objects (e.g. from an internal notes
 * endpoint that may be added later) the wire shape is:
 *   id         – platform ID string
 *   content    – body text
 *   person_id  – linked person (contact_id)
 *   organization_id – linked org (company_id)
 *   created_at / updated_at – ISO 8601
 */
import type { Note } from '../../../schema/note'

export interface RawSimplicateNote {
  id: string
  content?: string
  person_id?: string
  organization_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSimplicateNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.person_id ? String(raw.person_id) : undefined,
    company_id: raw.organization_id ? String(raw.organization_id) : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.person_id = data.contact_id
  if (data.company_id !== undefined) out.organization_id = data.company_id
  return out
}
