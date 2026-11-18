/**
 * UVdesk thread (message) transform.
 *
 * UVdesk thread wire shape (GET /{locale}/api/ticket/{id}/threads.json):
 *   id, reply, threadType (reply|forward|note), userType (agent|customer),
 *   formatedCreatedAt, createdAt, user {id, email, name, role},
 *   attachments [], isLocked, isBookmarked
 *
 * threadType "note" -> internal; "reply"/"forward" -> public
 * userType "agent" -> user; "customer" -> contact
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawUvdeskThreadUser {
  id?: number | string
  email?: string
  name?: string
  role?: string
  [key: string]: unknown
}

export interface RawUvdeskThread {
  id?: number | string
  reply?: string
  threadType?: string
  userType?: string
  formatedCreatedAt?: string
  createdAt?: string
  user?: RawUvdeskThreadUser | null
  attachments?: Array<{ id?: number | string; name?: string }>
  isLocked?: boolean
  isBookmarked?: boolean
  [key: string]: unknown
}

export function transformMessage(raw: RawUvdeskThread, ticketId: string): Message {
  const type: MessageType = raw.threadType === 'note' ? 'internal' : 'public'
  const authorType: AuthorType = raw.userType === 'agent' ? 'user' : 'contact'
  // Prefer raw createdAt; fall back to formatedCreatedAt (pre-formatted, may still parse)
  const createdAt = toIso(raw.createdAt) ?? toIso(raw.formatedCreatedAt) ?? new Date(0).toISOString()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    ticketId,
    authorId: String(raw.user?.id ?? ''),
    authorType,
    body: pickStr(raw.reply) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt,
    platform: 'uvdesk',
    metadata: strMap({
      threadType: raw.threadType,
      isLocked: raw.isLocked,
      isBookmarked: raw.isBookmarked,
    }),
    raw,
  }
}
