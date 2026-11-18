import type { Note } from '../../../schema/note'

export interface RawOntraportNote {
  id: string
  message?: string
  parent_id?: string | null
  contact_id?: string | null
  owner?: string | null
  date?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawOntraportNote): Note {
  return {
    id: String(raw.id),
    content: raw.message ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: raw.date ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.message = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
