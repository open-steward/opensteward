import type { Note } from '../../../schema/note'

// RetailCRM does not have standard notes. Stub for structural completeness.

export interface RawRetailCrmNote {
  id: number | string
  [key: string]: unknown
}

export function transformNote(raw: RawRetailCrmNote): Note {
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
