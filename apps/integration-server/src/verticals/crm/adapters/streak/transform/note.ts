import type { Note } from '../../../schema/note'

/**
 * Streak stores notes as "comments" on boxes (deals). A comment is fetched via
 * GET /boxes/{key}/comments and created via POST /boxes/{key}/comments.
 */
export interface RawStreakComment {
  key: string
  message?: string
  creatorKey?: string
  createdDate?: number
  lastUpdatedDate?: number
  /** Populated by the adapter — the box key this comment belongs to. */
  _boxKey?: string
  [key: string]: unknown
}

export function transformNote(raw: RawStreakComment): Note {
  return {
    id: raw.key,
    content: raw.message ?? '',
    deal_id: raw._boxKey,
    owner_id: raw.creatorKey,
    created_at: raw.createdDate != null ? new Date(raw.createdDate).toISOString() : undefined,
    updated_at: raw.lastUpdatedDate != null ? new Date(raw.lastUpdatedDate).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.message = data.content
  return out
}
