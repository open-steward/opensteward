/**
 * Intercom conversation source + conversation parts → canonical Messages.
 *
 * `GET /conversations/{id}` "will return a single Conversation model with all
 * its conversation parts", capped: "The maximum number of conversation parts
 * that can be returned via the API is 500. If you have more than that we will
 * return the 500 most recent conversation parts." The opening message is not a
 * part; it is the conversation's `source`, which has no timestamp of its own,
 * so it takes the conversation's `created_at`.
 *
 * Only `part_type` `comment` (a reply) and `note` (an internal note) are
 * messages. The other documented part types (`assignment`, `open`, `close`,
 * `snoozed`, `conversation_attribute_updated_by_admin`, …) are events and are
 * dropped by `isMessagePart`.
 * https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { fromUnix, pickStr, strMap } from './shared'

export interface RawIntercomAuthor {
  /**
   * `conversation_part_author.type` is an unenumerated string; the 2.16
   * examples show admin, bot and user, and the sibling `ticket_part_author`
   * enumerates admin, bot, team, user.
   */
  type?: string
  id?: string | null
  name?: string | null
  email?: string | null
}

export interface RawIntercomConversationPart {
  type?: string
  id: string | number
  part_type?: string
  body?: string | null
  created_at?: number
  author?: RawIntercomAuthor | null
  attachments?: unknown[] | null
  redacted?: boolean
  [key: string]: unknown
}

export interface RawIntercomSource {
  type?: string
  id?: string | null
  delivered_as?: string
  subject?: string | null
  body?: string | null
  author?: RawIntercomAuthor | null
  attachments?: unknown[] | null
  redacted?: boolean
  [key: string]: unknown
}

const MESSAGE_PART_TYPES: Record<string, MessageType> = {
  comment: 'public',
  note: 'internal',
}

export function isMessagePart(part: RawIntercomConversationPart): boolean {
  // Own keys only: `in` would also accept inherited names such as "toString".
  return part.part_type !== undefined && Object.hasOwn(MESSAGE_PART_TYPES, part.part_type)
}

/** admin → agent (`user`), user → customer (`contact`), bot → `system`; a team or anything else is `unknown`. */
function mapAuthorType(t: string | undefined): AuthorType {
  switch (t) {
    case 'admin':
      return 'user'
    case 'user':
      return 'contact'
    case 'bot':
      return 'system'
    default:
      return 'unknown'
  }
}

export function transformMessage(
  part: RawIntercomConversationPart,
  conversationId: string,
): Message {
  const id = String(part.id)
  return {
    id,
    externalId: id,
    ticketId: conversationId,
    authorId: pickStr(part.author?.id) ?? '',
    authorType: mapAuthorType(part.author?.type),
    body: pickStr(part.body) ?? '',
    type: MESSAGE_PART_TYPES[part.part_type ?? ''] ?? 'unknown',
    attachmentCount: Array.isArray(part.attachments) ? part.attachments.length : 0,
    createdAt: fromUnix(part.created_at) ?? new Date(0).toISOString(),
    platform: 'intercom',
    metadata: strMap({
      partType: part.part_type,
      authorType: part.author?.type,
      redacted: part.redacted,
    }),
    raw: part,
  }
}

/** The conversation's opening message, or undefined when the source has no id to name it by. */
export function transformSourceMessage(
  source: RawIntercomSource | null | undefined,
  conversationId: string,
  conversationCreatedAt: number | undefined,
): Message | undefined {
  const id = pickStr(source?.id)
  if (!source || id === undefined) return undefined
  return {
    id,
    externalId: id,
    ticketId: conversationId,
    authorId: pickStr(source.author?.id) ?? '',
    authorType: mapAuthorType(source.author?.type),
    body: pickStr(source.body) ?? '',
    type: 'public',
    attachmentCount: Array.isArray(source.attachments) ? source.attachments.length : 0,
    createdAt: fromUnix(conversationCreatedAt) ?? new Date(0).toISOString(),
    platform: 'intercom',
    metadata: strMap({
      partType: 'source',
      sourceType: source.type,
      deliveredAs: source.delivered_as,
      authorType: source.author?.type,
      redacted: source.redacted,
    }),
    raw: source,
  }
}
