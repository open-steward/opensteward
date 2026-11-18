import type { Note } from '../../../schema/note'

// Ortto does not have a dedicated notes model — stub returning empty.
export interface RawOrttoNote {
  id?: string
  [key: string]: unknown
}

export function transformNote(raw: RawOrttoNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: '',
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  return out
}
