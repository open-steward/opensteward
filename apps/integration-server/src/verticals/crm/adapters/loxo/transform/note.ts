import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

/**
 * Raw Loxo person_event used as a note.
 * Loxo stores notes as person_events (GET/POST /person_events).
 * The body text is in the `notes` field.
 */
export interface RawLoxoNote {
  id: number | string
  notes?: string | null
  person_id?: number | string | null
  job_id?: number | string | null
  company_id?: number | string | null
  created_by_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawLoxoNote): Note {
  return {
    id: String(raw.id),
    content: raw.notes ?? '',
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    deal_id: undefined,
    owner_id: raw.created_by_id != null ? String(raw.created_by_id) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const inner: Record<string, unknown> = {}
  if (data.content !== undefined) inner['notes'] = data.content
  if (data.contact_id !== undefined) inner['person_id'] = data.contact_id
  if (data.owner_id !== undefined) inner['created_by_id'] = data.owner_id
  return { person_event: inner }
}
