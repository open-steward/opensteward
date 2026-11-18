import type { Note } from '../../../schema/note'
import type { NetHuntCommentEvent } from '../types'

export interface RawNetHuntNote {
  id?: string | number
  content?: string
  text?: string
  contact_id?: string | number
  company_id?: string | number
  deal_id?: string | number
  owner_id?: string | number
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

export function transformNote(raw: RawNetHuntNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.content ?? raw.text ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_time ?? undefined,
    updated_at: raw.updated_time ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['content'] = data.content
  if (data.contact_id !== undefined) out['contact_id'] = data.contact_id
  if (data.deal_id !== undefined) out['deal_id'] = data.deal_id
  return out
}

/** The folder role a comment's parent record belongs to. */
export type NoteParentRole = 'contact' | 'company' | 'deal'

/**
 * A `comment` event of a record timeline (components.schemas.CommentTimelineItem)
 * → canonical Note, attached to the parent record it was read from.
 *
 * Note.content is required and its only documented source is the event's
 * `text`; an event without one is refused rather than given empty content.
 * `creator` is "absent when the actor is not a resolvable workspace user", so
 * `owner_id` (its `email`) is optional.
 */
export function transformComment(
  raw: NetHuntCommentEvent,
  parent: { role: NoteParentRole; recordId: string },
): Note {
  if (typeof raw.text !== 'string' || raw.text === '') {
    throw new Error(`NetHunt CRM comment ${raw.id} has no text`)
  }
  const email = raw.creator?.email
  return {
    id: raw.id,
    content: raw.text,
    contact_id: parent.role === 'contact' ? parent.recordId : undefined,
    company_id: parent.role === 'company' ? parent.recordId : undefined,
    deal_id: parent.role === 'deal' ? parent.recordId : undefined,
    owner_id: typeof email === 'string' && email !== '' ? email : undefined,
    created_at: raw.timeISO,
    metadata: raw,
  }
}
