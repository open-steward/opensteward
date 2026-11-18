import type { Note } from '../../../schema/note'

export interface RawPodioComment {
  id: number
  value?: string
  created_by?: { id?: number; [key: string]: unknown }
  created_on?: string
  [key: string]: unknown
}

export function transformNote(raw: RawPodioComment): Note {
  return {
    id: String(raw.id),
    content: raw.value ?? '',
    owner_id: raw.created_by?.id != null ? String(raw.created_by.id) : undefined,
    created_at: raw.created_on,
    metadata: raw,
  }
}
