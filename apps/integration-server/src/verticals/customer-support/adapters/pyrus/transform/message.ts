/**
 * Pyrus task comment → canonical Message transform.
 *
 * Pyrus comments are nested inside the task response under `comments[]`.
 * All comments are public by default (Pyrus has no internal-note concept
 * in the standard API). The `action` field ('finished', 'reopened') is
 * surfaced in metadata.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPyrusCommentMessage {
  id?: number
  create_date?: string
  author?: {
    id?: number
    first_name?: string
    last_name?: string
    email?: string
    type?: string
    [key: string]: unknown
  }
  text?: string
  action?: string
  attachments?: Array<{ id?: number; name?: string }>
  [key: string]: unknown
}

export function transformMessage(raw: RawPyrusCommentMessage, ticketId: string): Message {
  const type: MessageType = 'public'    // Pyrus API has no internal-note distinction
  const authorType: AuthorType = raw.author?.type === 'user' ? 'user' : 'contact'

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    ticketId,
    authorId: raw.author?.id != null ? String(raw.author.id) : '',
    authorType,
    body: pickStr(raw.text) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.create_date) ?? new Date(0).toISOString(),
    platform: 'pyrus',
    metadata: strMap({ action: raw.action }),
    raw,
  }
}
