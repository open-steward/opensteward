/**
 * Freshservice conversation transform.
 *
 * Freshservice calls ticket replies and notes "conversations". Key fields:
 *   id, body (HTML), body_text (plain), user_id, private (true = internal note),
 *   incoming, attachments, created_at, updated_at.
 *
 * The `user_id` on a conversation refers to an agent when the conversation
 * was created by an agent; for incoming replies it refers to the requester.
 * We map `incoming=true` → authorType='contact', else 'user'.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFreshserviceConversation {
  id: number
  /** HTML body */
  body?: string
  /** Plain-text body */
  body_text?: string
  /** ID of the user (agent or requester) who created the conversation */
  user_id?: number
  /** true = internal note, false/absent = public reply */
  private?: boolean
  /** true = incoming reply from requester */
  incoming?: boolean
  attachments?: Array<{ id: number; name?: string }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformMessage(raw: RawFreshserviceConversation, ticketId: string): Message {
  const type: MessageType = raw.private === true ? 'internal' : 'public'
  const authorType: AuthorType = raw.incoming === true ? 'contact' : 'user'
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: String(raw.user_id ?? ''),
    authorType,
    body: pickStr(raw.body_text) ?? pickStr(raw.body) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'freshservice',
    metadata: strMap({}),
    raw,
  }
}
