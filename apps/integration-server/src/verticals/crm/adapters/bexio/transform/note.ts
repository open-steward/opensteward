import type { Note } from '../../../schema/note'

// Bexio uses "notes" for notes
export interface RawBexioNote {
  id?: number
  text?: string
  contact_id?: number
  user_id?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawBexioNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.text ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.contact_id = Number(data.contact_id)
  return out
}
