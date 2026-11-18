/**
 * Transform an eDesk `Ticket_Item` (the `data` of Read Message,
 * https://developers.edesk.com/reference/getmessage.md) to the canonical
 * Message schema.
 *
 * Documented fields: id, external_id, subject, created_at, from_consumer_id,
 * from_user {id,name,email,...}, type (enum incl. "Message", "Note"),
 * attachments [{id,name,link,mime}], direction ("Incoming" | "Outgoing" |
 * "Other"), body, errors, ticket_id.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { strMap } from './shared'

export interface RawEdeskMessage {
  id: number
  external_id?: string | null
  subject?: string | null
  created_at?: string | null
  from_consumer_id?: number | null
  from_user?: { id?: number; name?: string; email?: string } | null
  type?: string | null
  direction?: string | null
  body?: string | null
  attachments?: Array<{ id?: number; name?: string; mime?: string }> | null
  errors?: string[] | null
  ticket_id?: number | null
}

/** "Message" is a reply to the buyer, "Note" is internal (Create Message docs). */
function mapMessageType(type: string | null | undefined): MessageType {
  if (type === 'Message') return 'public'
  if (type === 'Note') return 'internal'
  return 'unknown'
}

function mapAuthorType(direction: string | null | undefined): AuthorType {
  if (direction === 'Incoming') return 'contact'
  if (direction === 'Outgoing') return 'user'
  return 'unknown'
}

function resolveAuthorId(raw: RawEdeskMessage): string {
  if (raw.direction === 'Incoming' && raw.from_consumer_id != null) {
    return String(raw.from_consumer_id)
  }
  if (raw.direction === 'Outgoing' && raw.from_user?.id != null) return String(raw.from_user.id)
  return ''
}

/**
 * eDesk documents `created_at` only as a string, and every datetime example
 * in its API reference is zone-less ("2023-01-21 14:30:00"); the zone is not
 * documented. Only a value that carries its own offset is converted — a
 * zone-less one would have to be guessed, so it throws.
 */
const ZONED_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

function createdAtIso(raw: RawEdeskMessage): string {
  const s = raw.created_at
  if (typeof s !== 'string' || !ZONED_ISO.test(s) || Number.isNaN(new Date(s).getTime())) {
    throw Object.assign(
      new Error(
        `eDesk message ${raw.id}: created_at ${JSON.stringify(s ?? null)} carries no time zone, ` +
          'and eDesk does not document which zone its datetimes are in',
      ),
      { statusCode: 502, code: 'UPSTREAM_SHAPE' },
    )
  }
  return new Date(s).toISOString()
}

export function transformMessage(raw: RawEdeskMessage, ticketId: string): Message {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: resolveAuthorId(raw),
    authorType: mapAuthorType(raw.direction),
    body: raw.body ?? '',
    type: mapMessageType(raw.type),
    attachmentCount: raw.attachments ? raw.attachments.length : undefined,
    createdAt: createdAtIso(raw),
    platform: 'edesk',
    metadata: strMap({
      direction: raw.direction,
      subject: raw.subject,
      externalMessageId: raw.external_id,
      messageType: raw.type,
    }),
    raw,
  }
}
