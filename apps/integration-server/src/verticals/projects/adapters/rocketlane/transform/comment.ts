import type { Comment } from '../../../schema'

/**
 * One comment as GET /1.0/comments (in `data[]`) and GET /1.0/comments/{commentId}
 * return it. Every field below is from Rocketlane's published OpenAPI
 * (https://developer.rocketlane.com/reference/get-comments):
 *
 *   - `commentId`  "Unique identifier for the comment" (int64)
 *   - `content`    "Content of the comment"
 *   - `createdAt`  "Timestamp representing the creation time of the comment"
 *                  (int64, epoch milliseconds, example 1681319726000)
 *   - `createdBy`  "Details of the user who created the comment" (`userId`, ...)
 *   - `source`     "Source associated with the comment": `sourceId` and
 *                  `sourceType`, one of TASK or PROJECT_CONVERSATIONS
 *   - `attachments` returned only when `includeFields=attachments` is sent
 *   - `private`    "Indicates whether the comment is private or public"
 *
 * The response carries no update timestamp and no mention list.
 */
export interface RawRocketlaneComment {
  commentId?: number
  content?: string
  createdAt?: number
  createdBy?: {
    userId?: number
    emailId?: string
    firstName?: string
    lastName?: string
  }
  source?: {
    sourceId?: number
    sourceType?: 'TASK' | 'PROJECT_CONVERSATIONS'
  }
  attachments?: Array<{ attachmentId?: number }>
  private?: boolean
}

/**
 * Map a Rocketlane comment to the canonical Comment.
 *
 * `projectId` is not in the comment payload; the list passes the project it
 * filtered on (`projectId.eq`), and a single get leaves it unset.
 * `taskId` is the source id when the documented `source.sourceType` is TASK.
 */
export function transformComment(raw: RawRocketlaneComment, projectId?: string): Comment {
  if (raw.commentId == null) throw new Error('Rocketlane comment has no commentId')
  const id = String(raw.commentId)
  if (raw.createdBy?.userId == null) {
    throw new Error(`Rocketlane comment ${id} has no createdBy.userId`)
  }
  if (typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt)) {
    throw new Error(`Rocketlane comment ${id} has no createdAt`)
  }
  const source = raw.source
  const taskId =
    source?.sourceType === 'TASK' && source.sourceId != null ? String(source.sourceId) : undefined

  const metadata: Record<string, string> = {}
  if (source?.sourceType) metadata['sourceType'] = source.sourceType
  if (source?.sourceId != null) metadata['sourceId'] = String(source.sourceId)
  if (typeof raw.private === 'boolean') metadata['private'] = String(raw.private)

  return {
    id,
    externalId: id,
    ...(taskId !== undefined ? { taskId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    authorId: String(raw.createdBy.userId),
    // The spec marks only `source` required; a comment without `content` has
    // no text, which the canonical (required) body represents as ''.
    body: typeof raw.content === 'string' ? raw.content : '',
    mentions: [],
    ...(Array.isArray(raw.attachments) ? { attachmentCount: raw.attachments.length } : {}),
    createdAt: new Date(raw.createdAt).toISOString(),
    platform: 'rocketlane',
    metadata,
    raw,
  }
}
