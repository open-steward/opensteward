/**
 * Transform between EngageBay note wire format and canonical Note.
 *
 * EngageBay note fields: id, subject, content, parentId (contact/company/deal id).
 * Notes are created via POST /dev/api/panel/notes and retrieved via
 * GET /dev/api/panel/notes/{contactId}.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawEngageBayNote {
  id?: number | string
  subject?: string
  content?: string
  parentId?: number | string
  owner_id?: number | string
  created_time?: number | string
  updated_time?: number | string
  [key: string]: unknown
}

export function transformNote(raw: RawEngageBayNote, contactId?: string): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.content ?? raw.subject ?? '',
    contact_id: contactId ?? (raw.parentId != null ? String(raw.parentId) : undefined),
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: toIsoDatetime(raw.created_time),
    updated_at: toIsoDatetime(raw.updated_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.parentId = Number(data.contact_id)

  // EngageBay POST /dev/api/panel/notes requires a `subject` field.
  // Synthesize from content if no dedicated subject is available,
  // truncating to the API's 255-char limit.
  const subjectSource = typeof data.content === 'string' ? data.content : ''
  out.subject = subjectSource.length > 255 ? subjectSource.slice(0, 255) : subjectSource

  return out
}
