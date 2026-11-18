import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

/**
 * Raw note object returned by `GET /v1/notes` and `GET /v1/notes/:id`
 * in the Groove by Clari sales CRM REST API.
 *
 * Field reference: https://developer.groove.co/
 */
export interface RawGrooveTicket {
  id: number | string
  /** Body/content of the note. */
  body?: string | null
  /** Short subject or title (present on some response shapes). */
  title?: string | null
  /** Associated person (contact) ID. */
  person_id?: number | string | null
  /** Owner / author user ID. */
  author_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * Transform a raw Groove note into the canonical Note shape.
 */
export function transformNote(raw: RawGrooveTicket): Note {
  const id = String(raw.id)

  return {
    id,
    content: raw.body ?? raw.title ?? '',
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    owner_id: raw.author_id != null ? String(raw.author_id) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Reverse-map a canonical Note to a Groove note create payload
 * (`POST /v1/notes`).
 */
export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (data.content !== undefined) out['body'] = data.content
  if (data.contact_id !== undefined) out['person_id'] = data.contact_id

  return out
}
