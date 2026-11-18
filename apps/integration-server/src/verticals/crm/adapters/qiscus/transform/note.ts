import type { Note } from '../../../schema/note'

// Qiscus does not have a native note entity
// This is a stub — list returns [] and write methods throw
export interface RawQiscusNote {
  id: string | number
  content?: string
  [key: string]: unknown
}

export function transformNote(raw: RawQiscusNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  return out
}
