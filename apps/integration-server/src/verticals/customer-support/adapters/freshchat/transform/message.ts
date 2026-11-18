/**
 * Transform a Freshchat message into the canonical Message schema.
 *
 * Freshchat messages live under /v2/conversations/{id}/messages.
 * Text content is nested: message_parts[].text.content
 * actor_type: "user" | "agent" | "bot" | "system"
 * message_type: "normal" | "private" | "system"
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFreshchatMessage {
  id: string
  conversation_id?: string
  channel_id?: string
  app_id?: string
  actor_type?: string
  actor_id?: string
  user_id?: string
  message_type?: string
  message_parts?: Array<{
    text?: { content?: string }
    image?: { url?: string }
    file?: { url?: string; name?: string }
  }>
  reply_parts?: Array<unknown>
  created_time?: string
  [key: string]: unknown
}

function mapMessageType(raw: RawFreshchatMessage): MessageType {
  if (raw.message_type === 'private') return 'internal'
  if (raw.message_type === 'system') return 'system'
  return 'public'
}

function mapAuthorType(actorType: string | undefined): AuthorType {
  if (actorType === 'agent' || actorType === 'bot') return 'agent'
  return 'user'
}

function extractBody(raw: RawFreshchatMessage): string {
  for (const part of raw.message_parts ?? []) {
    const text = part.text?.content
    if (text) return text
  }
  return ''
}

export function transformMessage(raw: RawFreshchatMessage, conversationId: string): Message {
  const actorId = pickStr(raw.actor_id) ?? pickStr(raw.user_id) ?? ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId: conversationId,
    authorId: actorId,
    authorType: mapAuthorType(raw.actor_type),
    body: extractBody(raw),
    type: mapMessageType(raw),
    attachmentCount: undefined,
    createdAt: toIso(raw.created_time) ?? new Date(0).toISOString(),
    platform: 'freshchat',
    metadata: strMap({
      actorType: raw.actor_type,
      messageType: raw.message_type,
      channelId: raw.channel_id,
    }),
    raw,
  }
}
