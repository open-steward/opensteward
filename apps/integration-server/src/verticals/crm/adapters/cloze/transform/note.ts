/**
 * Transform Cloze timeline/content records (style=note) to/from canonical Note.
 *
 * Cloze "content" records created via POST /v1/timeline/content/create with
 * style="note" serve as notes. Key fields:
 *   uniqueid   — external unique id used to reference the note
 *   subject    — note title / summary (maps to content when body is absent)
 *   body       — full note text
 *   from       — email address / identifier of the author
 *   date       — ISO 8601 string or ms epoch when note was created
 *   references — [{ type, identifier }] for linked people/companies/projects
 *
 * Cloze does not provide a first-class note-retrieval GET endpoint — notes are
 * accessed via timeline feeds. The transform covers the create/write direction
 * and handles whatever shape comes back from a feed or webhook event.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface ClozeNoteReference {
  type?: 'person' | 'company' | 'project'
  identifier?: string
  [key: string]: unknown
}

export interface RawClozeNote {
  /** Caller-assigned unique id. */
  uniqueid?: string
  id?: string
  subject?: string
  body?: string
  from?: string
  style?: string
  date?: string | number
  references?: ClozeNoteReference[]
  [key: string]: unknown
}

export function transformNote(raw: RawClozeNote): Note {
  const id = raw.uniqueid ?? raw.id ?? ''
  const content = raw.body ?? raw.subject ?? ''

  // Extract linked person / company identifiers from references
  const personRef = raw.references?.find((r) => r.type === 'person')
  const companyRef = raw.references?.find((r) => r.type === 'company')

  return {
    id: String(id),
    content,
    contact_id: personRef?.identifier ? String(personRef.identifier) : undefined,
    company_id: companyRef?.identifier ? String(companyRef.identifier) : undefined,
    owner_id: raw.from,
    created_at: toIsoDatetime(raw.date),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    style: 'note',
  }
  if (data.content !== undefined) out.body = data.content
  if (data.owner_id !== undefined) out.from = data.owner_id

  const references: ClozeNoteReference[] = []
  if (data.contact_id !== undefined) references.push({ type: 'person', identifier: data.contact_id })
  if (data.company_id !== undefined) references.push({ type: 'company', identifier: data.company_id })
  if (references.length > 0) out.references = references

  return out
}
