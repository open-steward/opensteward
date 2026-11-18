import type { Note } from '../../../schema/note'

// weclapp does not have a standard notes endpoint. Stub for structural completeness.

export interface RawWeclappNote {
  id: string
  [key: string]: unknown
}

export function transformNote(raw: RawWeclappNote): Note {
  return {
    id: String(raw.id),
    content: '',
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  return out
}
