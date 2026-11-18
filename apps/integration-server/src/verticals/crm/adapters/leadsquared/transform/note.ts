import type { Note } from '../../../schema/note'

export interface RawLeadsquaredNote {
  id: string | number
  content?: string
  contactId?: string
  [key: string]: unknown
}

export function transformNote(raw: RawLeadsquaredNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.contactId ? String(raw.contactId) : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  return out
}
