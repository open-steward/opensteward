/**
 * Gallabox does not have a native Note resource.
 * This file is a stub — the registry returns HTTP 501 automatically.
 *
 * Docs: https://developers.gallabox.com/
 */
import type { Note } from '../../../schema/note'

export interface RawGallaboxNote {
  id: string | number
  content?: string
  [key: string]: unknown
}

export function transformNote(raw: RawGallaboxNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
