/**
 * Deskpro ticket message transform.
 *
 * Endpoint: GET /api/v2/tickets/{id}/messages
 * Response envelope: { data: [...] }
 *
 * is_note === true  → internal note; otherwise public reply.
 * person field identifies the author (person or agent).
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Deskpro message object as returned inside response.data for
 * GET /api/v2/tickets/{id}/messages.
 */
export interface RawDeskproMessage {
  id: number
  /** True if this is an internal note rather than a customer reply */
  is_note?: boolean
  /** The author — a person or agent sub-object with at least an id */
  person?: { id?: number; is_agent?: boolean } | number | null
  /** Plain-text body */
  message?: string
  /** HTML body — used only when plain message is absent */
  message_html?: string | null
  /** Blob attachments */
  attachments?: Array<{ id?: number; file_name?: string }>
  date_created?: string
  [key: string]: unknown
}

function extractAuthor(msg: RawDeskproMessage): { authorId: string; authorType: AuthorType } {
  const p = msg.person
  if (p == null) return { authorId: '', authorType: 'user' }
  if (typeof p === 'number') return { authorId: String(p), authorType: 'user' }
  const id = String((p as { id?: number }).id ?? '')
  const isAgent = (p as { is_agent?: boolean }).is_agent === true
  return { authorId: id, authorType: isAgent ? 'agent' : 'user' }
}

export function transformMessage(raw: RawDeskproMessage, ticketId: string): Message {
  const type: MessageType = raw.is_note === true ? 'internal' : 'public'
  const { authorId, authorType } = extractAuthor(raw)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.message) ?? pickStr(raw.message_html) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.date_created) ?? new Date(0).toISOString(),
    platform: 'deskpro',
    metadata: strMap({}),
    raw,
  }
}
