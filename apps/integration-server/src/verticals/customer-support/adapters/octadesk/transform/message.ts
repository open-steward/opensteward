/**
 * Transform Octadesk ticket interaction to canonical Message.
 *
 * Octadesk exposes interactions (messages/notes) via:
 *   GET /tickets/{number}/interactions
 *
 * Fields: id, type (PUBLIC | PRIVATE | NOTE), author{id, name, email},
 *         text (or content), attachments[], createdAt
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawOctadeskInteractionAuthor {
  id?: string
  name?: string
  email?: string
  [key: string]: unknown
}

export interface RawOctadeskInteraction {
  /** Interaction UUID */
  id?: string
  /**
   * Octadesk interaction type:
   *   PUBLIC  = public reply visible to requester
   *   PRIVATE = internal note, agent-only
   *   NOTE    = internal note variant
   */
  type?: string
  author?: RawOctadeskInteractionAuthor
  /** Plain-text body */
  text?: string
  /** HTML body (fallback) */
  content?: string
  attachments?: Array<{ id?: string; name?: string; [key: string]: unknown }>
  createdAt?: string
  [key: string]: unknown
}

function mapMessageType(raw: string | undefined): MessageType {
  const t = (raw ?? '').toUpperCase()
  if (t === 'PRIVATE' || t === 'NOTE') return 'internal'
  return 'public'
}

function mapAuthorType(raw: RawOctadeskInteractionAuthor | undefined): AuthorType {
  // Octadesk doesn't expose role at interaction level; default to 'user'
  if (!raw) return 'user'
  return 'user'
}

export function transformMessage(raw: RawOctadeskInteraction, ticketId: string): Message {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    ticketId,
    authorId: raw.author?.id ? String(raw.author.id) : '',
    authorType: mapAuthorType(raw.author),
    body: pickStr(raw.text) ?? pickStr(raw.content) ?? '',
    type: mapMessageType(raw.type),
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'octadesk',
    metadata: strMap({
      authorName: raw.author?.name,
      authorEmail: raw.author?.email,
      rawType: raw.type,
    }),
    raw,
  }
}
