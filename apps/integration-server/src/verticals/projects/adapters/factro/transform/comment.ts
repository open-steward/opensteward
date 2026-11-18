/**
 * Factro comment transform.
 *
 * Factro has comments on both projects and packages.
 * Project comment fields (camelCase JSON):
 *   id, text, creationDate, changeDate, creatorId, projectId, parentId, mandantId
 *
 * Package comment fields:
 *   id, text, creationDate, changeDate, creatorId, taskPackageId, parentId, mandantId
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFactroComment {
  id: string
  text?: string
  creationDate?: string
  changeDate?: string
  creatorId?: string
  projectId?: string
  taskPackageId?: string
  parentId?: string
  mandantId?: string
  [key: string]: unknown
}

export function transformComment(raw: RawFactroComment, contextId?: string, isProject?: boolean): Comment {
  const projectId = isProject ? (contextId ?? pickStr(raw.projectId)) : pickStr(raw.projectId)
  const taskId = !isProject ? (contextId ?? pickStr(raw.taskPackageId)) : pickStr(raw.taskPackageId)
  return {
    id: raw.id,
    externalId: raw.id,
    taskId,
    projectId,
    authorId: pickStr(raw.creatorId) ?? '',
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.creationDate) ?? new Date(0).toISOString(),
    platform: 'factro',
    metadata: strMap({ parentId: raw.parentId }),
    raw,
  }
}
