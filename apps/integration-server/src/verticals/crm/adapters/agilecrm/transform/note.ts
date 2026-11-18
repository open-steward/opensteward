import type { Note } from '../../../schema/note'

export interface RawAgileCrmNote {
  id: number
  subject?: string
  description?: string
  contact_json?: { id: number; name?: string } | null
  owner_id?: number
  created_time?: number
  updated_time?: number
  [key: string]: unknown
}

export function transformNote(raw: RawAgileCrmNote): Note {
  return {
    id: String(raw.id),
    content: raw.description ?? raw.subject ?? '',
    contact_id: raw.contact_json?.id != null ? String(raw.contact_json.id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_time ? new Date(raw.created_time * 1000).toISOString() : undefined,
    updated_at: raw.updated_time ? new Date(raw.updated_time * 1000).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) {
    out.subject = data.content
    out.description = data.content
  }
  return out
}
