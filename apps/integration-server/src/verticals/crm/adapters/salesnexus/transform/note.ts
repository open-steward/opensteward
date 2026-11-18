/**
 * SalesNexus note transforms.
 *
 * SalesNexus notes are attached to contacts via create-note /
 * get-notes-for-contact. A note has a flat structure with `note-id`,
 * `details` (body), `contact-id`, and `user-id`.
 *
 * Transforms NEVER throw — missing optional fields return undefined.
 */
import type { Note } from '../../../schema/note'

/** Raw SalesNexus note as returned by get-notes-for-contact. */
export interface RawSalesnexusNote {
  /** Platform note identifier. */
  'note-id': string
  /** Free-form note body. */
  details?: string
  /** Contact ID this note is attached to. */
  'contact-id'?: string
  /** User ID of the author. */
  'user-id'?: string
  /** Note type label. */
  type?: string
  /** ISO-8601-compatible creation date. */
  'created-date'?: string
  [key: string]: unknown
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

export function transformNote(raw: RawSalesnexusNote): Note {
  return {
    id: String(raw['note-id']),
    content: raw.details ?? '',
    contact_id: raw['contact-id'] ? String(raw['contact-id']) : undefined,
    owner_id: raw['user-id'] ? String(raw['user-id']) : undefined,
    created_at: toIso(raw['created-date']),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Build parameters for create-note.
 */
export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content != null) out['details'] = data.content
  if (data.contact_id != null) out['contact-id'] = data.contact_id
  if (data.owner_id != null) out['user-id'] = data.owner_id
  return out
}
