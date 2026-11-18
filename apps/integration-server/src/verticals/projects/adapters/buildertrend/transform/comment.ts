import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Buildertrend comment — a text note attached to a to-do (and other
 * entities). Attachment CONTENT is refused; only the count is surfaced.
 */
export interface RawBuildertrendComment {
  id: number | string
  text?: string
  body?: string
  comment?: string
  createdByUserId?: number | string
  authorId?: number | string
  createdByUser?: { id: number | string }
  todoId?: number | string
  relatedId?: number | string
  jobId?: number | string
  attachmentCount?: number
  attachments?: unknown[]
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformComment(
  raw: RawBuildertrendComment,
  taskId?: string,
  projectId?: string,
): Comment {
  const resolvedTask = taskId ?? (raw.todoId ?? raw.relatedId)
  const resolvedProject = projectId ?? raw.jobId
  const attachmentCount =
    typeof raw.attachmentCount === 'number'
      ? raw.attachmentCount
      : Array.isArray(raw.attachments)
        ? raw.attachments.length
        : 0
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    taskId: resolvedTask != null ? String(resolvedTask) : undefined,
    projectId: resolvedProject != null ? String(resolvedProject) : undefined,
    authorId: String(raw.createdByUserId ?? raw.authorId ?? raw.createdByUser?.id ?? ''),
    body: pickStr(raw.text ?? raw.body ?? raw.comment) ?? '',
    mentions: [],
    attachmentCount,
    createdAt: toIso(raw.createdDate) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.modifiedDate),
    platform: 'buildertrend',
    metadata: strMap({}),
    raw,
  }
}
