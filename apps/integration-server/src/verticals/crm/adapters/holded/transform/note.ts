import type { Note } from '../../../schema/note'

export interface RawHoldedNote {
  id: string
  text?: string
  contactId?: string
  created?: number
  [key: string]: unknown
}

export function transformNote(raw: RawHoldedNote): Note {
  return {
    id: String(raw.id),
    content: raw.text ?? '',
    contact_id: raw.contactId ? String(raw.contactId) : undefined,
    created_at: raw.created ? new Date(raw.created * 1000).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  return out
}
