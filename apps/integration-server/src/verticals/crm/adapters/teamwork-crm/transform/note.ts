import type { Note } from '../../../schema/note'
import { entityId, refId, str, type TeamworkRef } from '../raw'

/**
 * The Note model of `GET /notes/{id}.json` (`note`), documented fields only
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/notes/get-notes-idjson):
 * "A Note can be related to one of Company, Contact or Deal." `subject` is
 * that relationship, its `type` one of "deals", "companies", "contacts".
 */
export interface RawTeamworkNote {
  id: number
  description?: string | null
  subject?: TeamworkRef | null
  createdBy?: TeamworkRef | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function subjectId(
  raw: RawTeamworkNote,
  type: 'contacts' | 'companies' | 'deals',
): string | undefined {
  return raw.subject?.type === type ? refId(raw.subject) : undefined
}

export function transformNote(raw: RawTeamworkNote): Note {
  return {
    id: entityId(raw, 'note'),
    // "When a property is empty, it will always be returned by the API. It will
    // either be `null`, `[]`, `{}`" — a null description is an empty note.
    content: raw.description ?? '',
    contact_id: subjectId(raw, 'contacts'),
    company_id: subjectId(raw, 'companies'),
    deal_id: subjectId(raw, 'deals'),
    // `createdBy`: "linking the user who created the entity."
    owner_id: refId(raw.createdBy),
    created_at: str(raw.createdAt),
    updated_at: str(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.body = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  return out
}
