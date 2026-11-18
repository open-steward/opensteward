/**
 * Transform a Kore.ai conversation message into the canonical Message.
 *
 * API endpoint: GET /agentassist/api/v1/public/{streamId}/conversations/{conversationId}
 * Messages come from the `messages` (or `notes`) arrays, or from the
 * Automation Conversation History API (/api/public/bot/{botId}/getMessages).
 *
 * The `components` field from the history API holds the actual text content.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKoreAiMessage {
  /** Mongo ID from history API */
  _id?: string
  /** Unique message identifier */
  messageId?: string
  /** 'incoming' (user/contact) | 'outgoing' (bot/agent) | 'note' */
  type?: string
  /** ISO timestamp or epoch ms */
  createdOn?: string | number
  /** ISO timestamp */
  timestamp?: string
  /** For agent messages */
  agentId?: string
  /** For user/contact messages */
  userId?: string
  /** Author info object */
  author?: { id?: string; type?: string; name?: string }
  /** Structured content blocks */
  components?: Array<{ componentType?: string; data?: { text?: string; body?: string } }>
  /** Plain text body (simpler responses) */
  message?: string
  /** Note text (from conversation notes array) */
  note?: string
  /** Note author ID */
  author_id?: string
  sessionId?: string
  [key: string]: unknown
}

function extractBody(raw: RawKoreAiMessage): string {
  // History API nests content in components[].data.text
  if (raw.components && Array.isArray(raw.components)) {
    for (const c of raw.components) {
      const text = c.data?.text ?? c.data?.body
      if (typeof text === 'string' && text.length > 0) return text
    }
  }
  return pickStr(raw.message ?? raw.note) ?? ''
}

function mapAuthorType(raw: RawKoreAiMessage): AuthorType {
  const t = (raw.author?.type ?? raw.type ?? '').toLowerCase()
  if (t === 'agent' || t === 'outgoing') return 'agent'
  if (t === 'bot') return 'bot'
  return 'user'
}

function mapMessageType(raw: RawKoreAiMessage): MessageType {
  if ((raw.type ?? '').toLowerCase() === 'note') return 'internal'
  return 'public'
}

export function transformMessage(raw: RawKoreAiMessage, ticketId: string): Message {
  const id = pickStr(raw._id ?? raw.messageId) ?? ''
  const authorId =
    pickStr(raw.agentId ?? raw.author?.id ?? raw.author_id ?? raw.userId) ?? ''
  return {
    id,
    externalId: id,
    ticketId,
    authorId,
    authorType: mapAuthorType(raw),
    body: extractBody(raw),
    type: mapMessageType(raw),
    createdAt:
      toIso(
        typeof raw.createdOn === 'number'
          ? new Date(raw.createdOn).toISOString()
          : raw.createdOn ?? raw.timestamp,
      ) ?? new Date(0).toISOString(),
    platform: 'kore-ai',
    metadata: strMap({
      sessionId: raw.sessionId,
      authorName: raw.author?.name,
    }),
    raw,
  }
}
