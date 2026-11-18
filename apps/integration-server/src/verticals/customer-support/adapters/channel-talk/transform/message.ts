/**
 * Transform a raw Channel Talk Message into a canonical Message.
 *
 * Channel Talk message fields:
 *   id          — string
 *   chatId      — parent UserChat ID
 *   chatType    — "userChat" | "group"
 *   personType  — "manager" | "bot" | "user"
 *   personId    — author ID (manager ID or user ID depending on personType)
 *   plainText   — plain-text body
 *   blocks      — rich-content blocks (ignored; use plainText)
 *   files       — array of file attachments
 *   createdAt   — epoch ms (number)
 *
 * Docs: https://developers.channel.io/docs/get-a-userchats-messages-1
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawChannelTalkMessage {
  id: string
  chatId?: string
  chatType?: string       // "userChat" | "group"
  personType?: string     // "manager" | "bot" | "user"
  personId?: string
  plainText?: string
  blocks?: unknown[]
  files?: unknown[]
  createdAt?: number      // epoch ms
  [key: string]: unknown
}

function mapAuthorType(personType: string | undefined): AuthorType {
  switch (personType) {
    case 'manager':
      return 'user'
    case 'user':
      return 'contact'
    case 'bot':
      return 'system'
    default:
      return 'user'
  }
}

function mapMessageType(personType: string | undefined): MessageType {
  // Channel Talk messages sent by managers via the Open API are 'internal'
  // (desk-to-desk notes); all other person types are customer-visible 'public'.
  return personType === 'manager' ? 'internal' : 'public'
}

/** Convert epoch-ms number to ISO-8601 string. */
function epochToIso(ms: number | null | undefined): string | undefined {
  if (ms == null) return undefined
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export function transformMessage(raw: RawChannelTalkMessage, ticketId: string): Message {
  return {
    id: raw.id,
    externalId: raw.id,
    ticketId,
    authorId: pickStr(raw.personId) ?? '',
    authorType: mapAuthorType(raw.personType),
    body: pickStr(raw.plainText) ?? '',
    type: mapMessageType(raw.personType),
    attachmentCount: raw.files ? (raw.files as unknown[]).length : undefined,
    createdAt: epochToIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'channel-talk',
    metadata: strMap({
      chatType: raw.chatType,
      personType: raw.personType,
    }),
    raw,
  }
}
