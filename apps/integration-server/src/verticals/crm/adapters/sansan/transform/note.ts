import type { Note } from '../../../schema/note'

// Sansan does not have a standalone notes API.
// This transform is a placeholder; listNotes returns [].
export interface RawSansanNote {
  id?: string
  content?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSansanNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.content ?? '',
    metadata: raw,
  }
}
