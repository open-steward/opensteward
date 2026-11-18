import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

/**
 * Raw Mixmax contact note (GET /v1/contacts/:id/notes).
 * Notes are attached to a specific contact.
 *
 * Docs: https://developer.mixmax.com/reference/list-contact-notes
 */
export interface RawMixmaxNote {
  _id?: string
  id?: string
  text?: string
  note?: string
  contactId?: string
  createdAt?: string | number
  updatedAt?: string | number
  [key: string]: unknown
}

export function transformNote(raw: RawMixmaxNote): Note {
  const id = raw._id ?? raw.id ?? ''
  const content = raw.text ?? raw.note ?? ''
  return {
    id: String(id),
    content,
    contact_id: raw.contactId ? String(raw.contactId) : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  return out
}
