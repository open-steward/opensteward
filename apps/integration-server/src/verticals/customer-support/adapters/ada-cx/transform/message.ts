/**
 * Ada conversation message → canonical Message.
 *
 * GET /api/v2/conversations/{conversation_id}/messages/
 * (https://docs.ada.cx/reference/conversations/fetch-conversation-messages-by-id)
 * returns MessageLogs: `message_id`, `created_at`, `author { id, role }` and
 * `content`, whose "structure varies based on the `type` field. Supported
 * types: text, link, file, quick_replies."
 *
 * Only `text` content has a `body`. A `file` counts as one attachment, and its
 * presigned URL and filename are not surfaced (attachment content is refused
 * by the schema). A `link` has no body text of its own, and `quick_replies`
 * are options for a question sent as a separate message.
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawAdaMessageLog {
  /** "Allowed values: `message_logs`" */
  type?: string
  message_id?: string
  created_at?: string
  author?: {
    /** "If the role is `end_user`, the ID of the end user. If the role is `ai_agent` or `human_agent`, this is null." */
    id?: string | null
    /** "Allowed values: `end_user`, `ai_agent`, `human_agent`" */
    role?: string
    avatar?: string | null
    display_name?: string | null
  }
  content?: {
    /** text | link | file | quick_replies */
    type?: string
    body?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function authorType(role: string | undefined): AuthorType {
  if (role === 'end_user') return 'contact'
  if (role === 'human_agent') return 'user'
  if (role === 'ai_agent') return 'system'
  return 'unknown'
}

export function transformMessage(raw: RawAdaMessageLog, conversationId: string): Message {
  const id = pickStr(raw.message_id)
  if (!id) throw new Error(`ada-cx: message in conversation ${conversationId} has no message_id`)
  const createdAt = toIso(raw.created_at)
  if (!createdAt) throw new Error(`ada-cx: message ${id} has no created_at`)
  const contentType = raw.content?.type
  return {
    id,
    externalId: id,
    ticketId: conversationId,
    // Null for `ai_agent` and `human_agent` authors, as documented.
    authorId: pickStr(raw.author?.id) ?? '',
    authorType: authorType(raw.author?.role),
    body: contentType === 'text' ? (pickStr(raw.content?.body) ?? '') : '',
    // Conversation messages pass between the end user and the AI or human
    // agent; the endpoint documents no internal-note kind.
    type: 'public',
    ...(contentType === 'file' ? { attachmentCount: 1 } : {}),
    createdAt,
    platform: 'ada-cx',
    metadata: strMap({
      authorRole: raw.author?.role,
      contentType,
    }),
    raw,
  }
}
