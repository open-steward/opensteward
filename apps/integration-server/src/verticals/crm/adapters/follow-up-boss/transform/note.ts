/**
 * Follow Up Boss note ↔ canonical Note transform.
 *
 * FUB note wire shape (GET /v1/notes, GET /v1/notes/:id):
 *   id          number
 *   personId    number   — attached contact id
 *   dealId      number   — attached deal id (optional)
 *   body        string   — note text content
 *   createdBy   string   — agent email or user id who authored the note
 *   userId      number
 *   created     string   — ISO 8601
 *   updated     string   — ISO 8601
 */
import type { Note } from '../../../schema/note'

export interface RawFollowUpBossNote {
  id?: number | string
  personId?: number | string
  dealId?: number | string
  body?: string
  createdBy?: string
  userId?: number | string
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformNote(raw: RawFollowUpBossNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.body ?? '',
    contact_id: raw.personId != null ? String(raw.personId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id:
      raw.createdBy ??
      (raw.userId != null ? String(raw.userId) : undefined),
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.body = data.content
  if (data.contact_id !== undefined) out.personId = data.contact_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  if (data.owner_id !== undefined) out.userId = data.owner_id
  return out
}
