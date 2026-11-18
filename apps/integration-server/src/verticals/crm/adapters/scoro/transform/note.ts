import type { Note } from '../../../schema/note'
import { idOf, isoWithOffset, requiredId } from '../fields'

/**
 * A Scoro comment. Fields from the Comments table at
 * https://api.scoro.com/api/v2:
 *
 *   comment_id    String    "Comment id"
 *   comment       String    "Comment content"
 *   user_id       Integer   "Comment owner id."
 *   modified_date Datetime  "Modified datetime"
 *
 * Only createNote reads this now: comments cannot be listed without a parent
 * ("module" and "object_id" are mandatory) and have no view action.
 */
export interface RawScoroNote {
  comment_id?: number | string
  parent_id?: number | string | null
  comment?: string | null
  user_id?: number | string | null
  modified_date?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawScoroNote): Note {
  if (typeof raw.comment !== 'string') {
    throw Object.assign(new Error('Scoro comment has no comment content'), {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  }
  return {
    id: requiredId(raw.comment_id, 'comment'),
    content: raw.comment,
    owner_id: idOf(raw.user_id),
    updated_at: isoWithOffset(raw.modified_date),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.project_id = data.deal_id
  return out
}
