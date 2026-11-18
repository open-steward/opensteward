import type { Note } from '../../../schema/note'

export interface RawHighLevelNote {
  id: string
  body?: string
  contactId?: string
  userId?: string
  dateAdded?: string
  dateUpdated?: string
  [key: string]: unknown
}

export function transformNote(raw: RawHighLevelNote, contactId?: string): Note {
  return {
    id: String(raw.id),
    content: raw.body ?? '',
    contact_id: raw.contactId ?? contactId,
    owner_id: raw.userId,
    created_at: raw.dateAdded,
    updated_at: raw.dateUpdated,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.body = data.content
  if (data.owner_id !== undefined) out.userId = data.owner_id
  return out
}
