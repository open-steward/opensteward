/**
 * Transform an osTicket thread entry into the canonical Message schema.
 *
 * osTicket thread entries have type: "message" (user) | "response" (staff) | "note" (internal).
 * Source: GET /tickets-get.php/{number}.json → ticket.thread[]
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import type { RawOsticketThreadEntry } from './ticket'
export type { RawOsticketThreadEntry }

function mapMessageType(entryType: string | undefined): MessageType {
  if (entryType === 'note') return 'internal'
  return 'public'
}

function mapAuthorType(entryType: string | undefined): AuthorType {
  // "message" entries are from end-users; "response" and "note" are from staff
  if (entryType === 'message') return 'contact'
  return 'user'
}

export function transformMessage(raw: RawOsticketThreadEntry, ticketId: string): Message {
  const attachmentCount =
    raw.attachment_count != null
      ? raw.attachment_count
      : (raw.attachments?.length ?? undefined)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    ticketId,
    authorId: raw.staffId != null ? String(raw.staffId) : (raw.userId != null ? String(raw.userId) : ''),
    authorType: mapAuthorType(raw.type),
    body: pickStr(raw.body) ?? '',
    type: mapMessageType(raw.type),
    attachmentCount,
    createdAt: toIso(raw.timestamp) ?? new Date(0).toISOString(),
    platform: 'osticket',
    metadata: strMap({
      entryType: raw.type,
      poster: raw.poster,
      staff: raw.staff,
    }),
    raw,
  }
}
