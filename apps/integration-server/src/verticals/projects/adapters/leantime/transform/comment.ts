/**
 * Transform a Leantime comment API object into the canonical Comment schema.
 *
 * Leantime comment repository fields (from getComments query):
 *   id, text, date, moduleId (entity the comment belongs to),
 *   userId (author), commentParent, status
 *
 * The Comments service is called as:
 *   leantime.rpc.Comments.getComments(module, entityId)
 * where `module` is e.g. 'ticket' and `entityId` is the task ID.
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLeantimeComment {
  id?: number | string
  text?: string
  date?: string
  moduleId?: number | string
  userId?: number | string
  commentParent?: number | string
  status?: string | number
  [key: string]: unknown
}

export function transformComment(
  raw: RawLeantimeComment,
  taskId?: string,
): Comment {
  const id = String(raw.id ?? '')
  const resolvedTaskId = taskId ?? (raw.moduleId != null ? String(raw.moduleId) : undefined)
  const authorId = raw.userId != null ? String(raw.userId) : ''
  return {
    id,
    externalId: id,
    taskId: resolvedTaskId,
    authorId,
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.date) ?? new Date(0).toISOString(),
    platform: 'leantime',
    metadata: strMap({
      commentParent: raw.commentParent,
      status: raw.status,
    }),
    raw,
  }
}
