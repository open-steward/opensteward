/**
 * SmartSuite comments map to canonical Comments.
 *
 * Fields per the Comment Object
 * (https://developers.smartsuite.com/docs/solution-data/comments/comment-object):
 *   solution "Id of the Solution that contains the record."
 *   application "The Table (app) Id."
 *   record "Id of the record the comment belongs to."
 *   member "Member Id of the comment's author."
 *   message "A SmartDoc object containing the comment body." (data, html, preview)
 *   parent_comment "Id of the parent comment when this comment is a reply"
 *   created_on "Date and time the comment was created." (not nullable)
 *   updated_on "Date and time the comment was last updated, or null."
 *   type 'Set to "comment" or "email"'
 *   key "Numeric key of the comment."
 *   id "Unique Id of the comment."
 *
 * The API documents no mention list and no attachments on a comment, so
 * `mentions` is empty and `attachmentCount` is left out.
 */
import type { Comment } from '../../../schema'
import { strMap, toIso } from './shared'

export interface RawSmartsuiteCommentMessage {
  data?: unknown
  html?: string
  preview?: string
}

export interface RawSmartsuiteComment {
  id: string
  solution?: string
  application?: string
  record?: string
  member?: string
  message?: RawSmartsuiteCommentMessage | null
  parent_comment?: string | null
  created_on?: string
  deleted_on?: string | null
  updated_on?: string | null
  reactions?: unknown[]
  key?: number
  assigned_to?: string | null
  resolved_by?: string | null
  followers?: string[]
  type?: string
  email?: string | null
  [key: string]: unknown
}

function required(raw: RawSmartsuiteComment, field: string, value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value
  throw new Error(`SmartSuite comment ${raw.id ?? '(no id)'} has no ${field}`)
}

export function transformComment(raw: RawSmartsuiteComment): Comment {
  const id = required(raw, 'id', raw.id)
  const preview = raw.message?.preview
  if (typeof preview !== 'string')
    throw new Error(`SmartSuite comment ${id} has no message.preview`)
  const createdAt = toIso(required(raw, 'created_on', raw.created_on))
  if (!createdAt) throw new Error(`SmartSuite comment ${id} has an unreadable created_on`)
  return {
    id,
    externalId: id,
    ...(raw.record ? { taskId: raw.record } : {}),
    ...(raw.solution ? { projectId: raw.solution } : {}),
    authorId: required(raw, 'member', raw.member),
    body: preview,
    mentions: [],
    createdAt,
    ...(toIso(raw.updated_on) ? { updatedAt: toIso(raw.updated_on) } : {}),
    platform: 'smartsuite',
    metadata: strMap({
      application: raw.application,
      type: raw.type,
      parentComment: raw.parent_comment,
      key: raw.key,
    }),
    raw,
  }
}
