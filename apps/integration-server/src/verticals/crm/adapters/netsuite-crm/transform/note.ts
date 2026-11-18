import type { Note } from '../../../schema/note'

// NetSuite CRM notes — stub
export interface RawNetsuiteNote {
  id: string | number
  [key: string]: unknown
}

export function transformNote(raw: RawNetsuiteNote): Note {
  return {
    id: String(raw.id),
    content: '',
    metadata: raw,
  }
}
