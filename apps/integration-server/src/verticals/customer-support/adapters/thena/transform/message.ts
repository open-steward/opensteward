import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw comment shape from GET /v1/comments?entityType=ticket&entityId=<id>
 */
export interface RawThenaComment {
  id: string
  content?: string
  contentMarkdown?: string
  commentVisibility?: string
  commentType?: string
  authorId?: string
  author?: string
  authorUserType?: string
  customerContactId?: string
  customerContactEmail?: string
  parentCommentId?: string
  attachments?: string[]
  isPinned?: boolean
  isEdited?: boolean
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  [key: string]: unknown
}

function mapCommentType(visibility: string | undefined): MessageType {
  if (!visibility) return 'public'
  const lower = visibility.toLowerCase()
  if (lower === 'internal' || lower === 'private') return 'internal'
  return 'public'
}

function mapAuthorType(userType: string | undefined, customerContactId: string | undefined): AuthorType {
  if (customerContactId) return 'contact'
  if (!userType) return 'user'
  const lower = userType.toLowerCase()
  if (lower === 'customer' || lower === 'contact') return 'contact'
  if (lower === 'bot' || lower === 'system' || lower === 'automation') return 'system'
  return 'user'
}

export function transformMessage(raw: RawThenaComment, ticketId: string): Message {
  const type: MessageType = mapCommentType(raw.commentVisibility)
  const authorType: AuthorType = mapAuthorType(raw.authorUserType, raw.customerContactId)
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    ticketId,
    authorId: pickStr(raw.authorId) ?? pickStr(raw.customerContactId) ?? '',
    authorType,
    body: pickStr(raw.contentMarkdown) ?? pickStr(raw.content) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.createdAt) ?? new Date(0).toISOString(),
    platform: 'thena',
    metadata: strMap({
      commentType: raw.commentType,
      parentCommentId: raw.parentCommentId,
      isPinned: raw.isPinned,
      isEdited: raw.isEdited,
    }),
    raw,
  }
}
