import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawAworkCommentMention {
  userId?: string
  id?: string
  [key: string]: unknown
}

export interface RawAworkComment {
  id: string
  message?: string
  plainFormattedMessage?: string
  formattedMessage?: string
  createdOn?: string
  createdBy?: string
  entityId?: string
  entityType?: string
  mentions?: RawAworkCommentMention[] | null
  [key: string]: unknown
}

function mentionIds(raw: RawAworkComment): string[] {
  return (raw.mentions ?? [])
    .map((m) => pickStr(m.userId) ?? pickStr(m.id))
    .filter((id): id is string => id !== undefined)
}

export function transformComment(raw: RawAworkComment, taskId?: string): Comment {
  const entityType = (raw.entityType ?? '').toLowerCase()
  const resolvedTaskId =
    taskId ?? (entityType === 'tasks' ? pickStr(raw.entityId) : undefined)
  const projectId = entityType === 'projects' ? pickStr(raw.entityId) : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    taskId: resolvedTaskId,
    projectId,
    authorId: pickStr(raw.createdBy) ?? '',
    body: pickStr(raw.plainFormattedMessage) ?? pickStr(raw.message) ?? '',
    mentions: mentionIds(raw),
    attachmentCount: 0,
    createdAt: toIso(raw.createdOn) ?? new Date(0).toISOString(),
    platform: 'awork',
    metadata: strMap({ entityType: raw.entityType }),
    raw,
  }
}
