/**
 * Transform a raw Jitbit Helpdesk comment/reply to the canonical Message schema.
 *
 * GET /comments?id={ticketId} returns an array of comment objects.
 * ForTechsOnly === true → internal note.
 * IsSystem === true      → system-generated message (automated, no human author).
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawJitbitComment {
  CommentID?: number
  IssueID?: number
  UserID?: number
  UserName?: string
  Email?: string
  FirstName?: string
  LastName?: string
  /** true = internal/tech-only note */
  ForTechsOnly?: boolean
  /** true = automated system message */
  IsSystem?: boolean
  Body?: string
  CommentDate?: string
  /** Not present on all endpoints */
  Recipients?: string | null
  [key: string]: unknown
}

export function transformMessage(raw: RawJitbitComment, ticketId: string): Message {
  const type: MessageType = raw.ForTechsOnly ? 'internal' : 'public'
  const authorType: AuthorType = raw.IsSystem ? 'system' : 'user'
  const displayName =
    pickStr(raw.FirstName) && pickStr(raw.LastName)
      ? `${raw.FirstName} ${raw.LastName}`.trim()
      : pickStr(raw.UserName)

  return {
    id: String(raw.CommentID ?? ''),
    externalId: String(raw.CommentID ?? ''),
    ticketId,
    authorId: raw.UserID != null ? String(raw.UserID) : '',
    authorType,
    body: pickStr(raw.Body) ?? '',
    type,
    attachmentCount: undefined,
    createdAt: toIso(raw.CommentDate) ?? new Date(0).toISOString(),
    platform: 'jitbit-helpdesk',
    metadata: strMap({
      authorName: displayName,
      authorEmail: raw.Email,
      isSystem: raw.IsSystem,
    }),
    raw,
  }
}
