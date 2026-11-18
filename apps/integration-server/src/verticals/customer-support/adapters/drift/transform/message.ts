import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawDriftComment {
  id: number
  type?: string
  public?: boolean
  author_id?: number
  body?: string
  html_body?: string
  plain_body?: string
  attachments?: Array<{ id: number; file_name?: string }>
  created_at?: string
  [key: string]: unknown
}

export function transformMessage(raw: RawDriftComment, ticketId: string): Message {
  const type: MessageType = raw.public === false ? 'internal' : 'public'
  const authorType: AuthorType = 'user'  // Zendesk doesn't distinguish at this level; refinement at adapter
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: String(raw.author_id ?? ''),
    authorType,
    body: pickStr(raw.plain_body) ?? pickStr(raw.body) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'drift',
    metadata: strMap({}),
    raw,
  }
}
