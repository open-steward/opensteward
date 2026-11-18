import type { Note } from '../../../schema/note'
import type { JsonApiResource } from '../client'

export interface RawOutreachNoteAttributes {
  content?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type RawOutreachNote = JsonApiResource<RawOutreachNoteAttributes>

/**
 * Outreach has no standalone notes resource — this is a placeholder so the
 * module shape is consistent. The adapter returns 501 for all note operations.
 */
export function transformNote(raw: RawOutreachNote): Note {
  return {
    id: String(raw.id),
    content: raw.attributes.content ?? '',
    created_at: raw.attributes.createdAt,
    updated_at: raw.attributes.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.content !== undefined) attributes['content'] = data.content
  return { data: { type: 'note', attributes } }
}
