/**
 * Wati does not have a native Note resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 */
import type { Note } from '../../../schema/note'

export interface RawWatiNote {
  id: string | number
  content?: string
  [key: string]: unknown
}

export function transformNote(raw: RawWatiNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
