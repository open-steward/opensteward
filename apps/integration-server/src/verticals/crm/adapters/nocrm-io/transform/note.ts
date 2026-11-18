/**
 * noCRM.io Comment → canonical Note transform.
 *
 * noCRM.io models notes as "comments" on a lead.
 * Endpoint: GET /leads/{lead_id}/comments  (returns array)
 *           POST /leads/{lead_id}/comments  (creates)
 *
 * Wire fields (REST v2):
 *   id, message (body), user_id (author), lead_id, created_at, updated_at
 */

import type { Note } from '../../../schema/note'

export interface RawNocrmNote {
  id: number | string
  /** Comment body text */
  message?: string | null
  /** Author user id */
  user_id?: number | string | null
  /** Parent lead id */
  lead_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawNocrmNote): Note {
  return {
    id: String(raw.id),
    content: raw.message ?? '',
    deal_id: raw.lead_id != null ? String(raw.lead_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['message'] = data.content
  return out
}
