import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

/**
 * One note (timeline item) as GET /v1/timeline/ (`data.items[]`) and
 * GET /v1/timeline/{noteId} (`data.note`) return it.
 *
 * Fields from https://getdex.com/docs/api-reference/reference/v1/timeline/list-notes
 * ("data.items[].id string (uuid) required", "data.items[].note string | null",
 * "data.items[].meeting_type string | null", "data.items[].event_time string (date-time)",
 * "data.items[].created_at string (date-time)", "data.items[].timeline_items_contacts array<object>").
 * v1 documents no updated_at on a note.
 *
 * The `timeline_items_contacts` row's `contact_id` is the field the same API
 * documents for that relation in the POST /v1/timeline/ and
 * PUT /v1/timeline/{noteId} request bodies ({contact_id, is_origin, contacts}).
 */
export interface RawDexNote {
  id: string
  note?: string | null
  meeting_type?: string | null
  event_time?: string | null
  created_at?: string | null
  timeline_items_contacts?: Array<{ contact_id?: string | null }>
  [key: string]: unknown
}

export function transformNote(raw: RawDexNote): Note {
  const contactId = raw.timeline_items_contacts?.[0]?.contact_id
  return {
    id: String(raw.id),
    // `note` is documented nullable: a timeline entry with no text.
    content: raw.note ?? '',
    contact_id: contactId ? String(contactId) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  // Default meeting_type to 'note' when not specified
  out.meeting_type = 'note'
  if (data.contact_id !== undefined) {
    out.timeline_items_contacts = { data: [{ contact_id: data.contact_id }] }
  }
  return out
}
