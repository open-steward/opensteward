/**
 * Transform an HD Ticket Comment (Frappe Helpdesk) into the canonical Message schema.
 *
 * Key HD Ticket Comment fields:
 *   name            — document ID
 *   reference_ticket — link to HD Ticket
 *   commented_by    — link to User (email)
 *   content         — HTML body of the comment
 *   creation        — ISO datetime
 *   is_pinned       — boolean (internal note indicator)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFrappeComment {
  name: string
  reference_ticket?: string
  commented_by?: string
  content?: string
  is_pinned?: number | boolean
  creation?: string
  modified?: string
  [key: string]: unknown
}

export function transformMessage(raw: RawFrappeComment, ticketId: string): Message {
  // Frappe Helpdesk doesn't have a public/internal flag on comments; is_pinned
  // is the closest approximation for an internal note.
  const type: MessageType = raw.is_pinned ? 'internal' : 'public'
  const authorType: AuthorType = 'user'
  return {
    id: raw.name,
    externalId: raw.name,
    ticketId,
    authorId: pickStr(raw.commented_by) ?? '',
    authorType,
    // content is HTML; strip tags for plain text body
    body: pickStr(raw.content)?.replace(/<[^>]+>/g, '').trim() ?? '',
    type,
    createdAt: toIso(raw.creation) ?? new Date(0).toISOString(),
    platform: 'frappe-helpdesk',
    metadata: strMap({ commentedBy: raw.commented_by, isPinned: raw.is_pinned }),
    raw,
  }
}
