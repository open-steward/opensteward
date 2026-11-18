/**
 * Transform between Megaplan API v3 Comment entities and canonical Note.
 *
 * Megaplan comments (ru: Комментарии) are attached to any entity
 * (deal, contractor, task, etc.) via the comments endpoint.
 * v3 API fields:
 *   id, contentType, text, author, subject (linked entity), timeCreated, timeUpdated
 */

import type { Note } from '../../../schema/note'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMegaplanNote {
  id?: string | number
  contentType?: string
  /** Comment body text */
  text?: string
  /** Author employee reference */
  author?: { id?: string | number; contentType?: string }
  /** The entity this comment belongs to */
  subject?: { id?: string | number; contentType?: string }
  /** Content type of the parent entity, e.g. "Contractor", "Deal" */
  subjectType?: string
  timeCreated?: string | number
  timeUpdated?: string | number
  [key: string]: unknown
}

export function transformNote(raw: RawMegaplanNote): Note {
  const authorId = raw.author?.id != null ? String(raw.author.id) : undefined
  const subjectId = raw.subject?.id != null ? String(raw.subject.id) : undefined
  const subjectType = raw.subjectType ?? raw.subject?.contentType ?? ''

  // Route the linked entity to the correct canonical field
  const isDeal = typeof subjectType === 'string' && /deal/i.test(subjectType)
  const isCompany = typeof subjectType === 'string' && /contractor/i.test(subjectType)

  return {
    id: String(raw.id ?? ''),
    content: raw.text ?? '',
    owner_id: authorId,
    contact_id: !isDeal && !isCompany && subjectId ? subjectId : undefined,
    company_id: isCompany ? subjectId : undefined,
    deal_id: isDeal ? subjectId : undefined,
    created_at: toIsoDatetime(raw.timeCreated),
    updated_at: toIsoDatetime(raw.timeUpdated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['text'] = data.content
  if (data.owner_id !== undefined) out['author'] = { id: data.owner_id }
  if (data.deal_id !== undefined) {
    out['subject'] = { id: data.deal_id, contentType: 'Deal' }
    out['subjectType'] = 'Deal'
  } else if (data.company_id !== undefined) {
    out['subject'] = { id: data.company_id, contentType: 'Contractor' }
    out['subjectType'] = 'Contractor'
  } else if (data.contact_id !== undefined) {
    out['subject'] = { id: data.contact_id, contentType: 'Contractor' }
    out['subjectType'] = 'Contractor'
  }
  return out
}
