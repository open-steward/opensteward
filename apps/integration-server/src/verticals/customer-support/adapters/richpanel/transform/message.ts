import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawRichpanelComment {
  id: string | number
  ticket_id?: string | number
  type?: string
  public?: boolean
  author_id?: string | number | null
  body?: string
  html_body?: string
  plain_body?: string
  isOperator?: boolean
  via?: { channel?: string }
  created_at?: string
  [key: string]: unknown
}

export function transformMessage(raw: RawRichpanelComment, ticketId: string): Message {
  const type: MessageType = raw.public === false ? 'internal' : 'public'
  // isOperator flag distinguishes agent-authored replies from customer messages
  const authorType: AuthorType = raw.isOperator ? 'agent' : 'user'
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: raw.author_id ? String(raw.author_id) : '',
    authorType,
    body: pickStr(raw.plain_body) ?? pickStr(raw.body) ?? '',
    type,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'richpanel',
    metadata: strMap({ rawChannel: raw.via?.channel }),
    raw,
  }
}
