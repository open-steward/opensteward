/**
 * Transform a Smartsupp message object into the canonical Message schema.
 *
 * Smartsupp messages have:
 *   id              — string starting with "ms"
 *   conversation_id — parent conversation id
 *   agent_id        — set when sub_type is "agent"; null for contact/system messages
 *   type            — "message" | "note" | "event"
 *   sub_type        — "agent" | "contact" | "system" | "trigger" | "bot"
 *   content         — { type, text?, html? }
 *   attachments     — array
 *   created_at      — ISO datetime
 *   is_offline      — sent while agents offline (offline form)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface RawSmartsuppMessageContent {
  type?: string
  text?: string | null
  html?: string | null
  [key: string]: unknown
}

export interface RawSmartsuppMessage {
  id: string
  conversation_id?: string
  agent_id?: string | null
  type?: string
  sub_type?: string
  content?: RawSmartsuppMessageContent
  attachments?: Array<{ id?: string; [key: string]: unknown }>
  created_at?: string
  updated_at?: string
  is_offline?: boolean
  is_reply?: boolean
  [key: string]: unknown
}

function mapMessageType(raw: RawSmartsuppMessage): MessageType {
  // "note" = internal note visible to agents only
  if (raw.type === 'note') return 'internal'
  return 'public'
}

function mapAuthorType(raw: RawSmartsuppMessage): AuthorType {
  switch (raw.sub_type) {
    case 'agent':
      return 'user'
    case 'contact':
      return 'contact'
    default:
      return 'user'
  }
}

function extractBody(content: RawSmartsuppMessageContent | undefined): string {
  if (!content) return ''
  return pickStr(content.text) ?? pickStr(content.html) ?? ''
}

export function transformMessage(raw: RawSmartsuppMessage, ticketId: string): Message {
  const authorType = mapAuthorType(raw)
  const authorId = raw.agent_id
    ? String(raw.agent_id)
    : ticketId // fallback — contact id not on message, use conversation id as surrogate
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId,
    authorType,
    body: extractBody(raw.content),
    type: mapMessageType(raw),
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'smartsupp',
    metadata: strMap({
      subType: raw.sub_type,
      contentType: raw.content?.type,
      isOffline: raw.is_offline,
      isReply: raw.is_reply,
    }),
    raw,
  }
}
