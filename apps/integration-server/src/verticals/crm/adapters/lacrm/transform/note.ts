import type { Note } from '../../../schema/note'

export interface RawLacrmNote {
  NoteId: string
  Note?: string
  ContactId?: string
  AssignedTo?: string
  DateCreated?: string
  DateModified?: string
  [key: string]: unknown
}

export function transformNote(raw: RawLacrmNote): Note {
  return {
    id: raw.NoteId,
    content: raw.Note ?? '',
    contact_id: raw.ContactId,
    owner_id: raw.AssignedTo,
    created_at: raw.DateCreated,
    updated_at: raw.DateModified,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Note = data.content
  if (data.contact_id !== undefined) out.ContactId = data.contact_id
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  return out
}
