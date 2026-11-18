/**
 * Transforms a raw Zoho Sprints item activity/comment into the canonical Comment schema.
 *
 * Zoho Sprints activity response fields (from GET /zsapi/team/{teamId}/projects/{projId}/sprints/{sprintId}/item/{itemId}/activity/):
 *   activityId, description (comment body), addedBy (zpuid), addedTime,
 *   type (comment type), itemId, projId, sprintId
 */
import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoSprintsActivity {
  activityId: string
  description?: string
  addedBy?: string
  addedTime?: string | number
  type?: string | number
  itemId?: string
  projId?: string
  sprintId?: string | number
  [key: string]: unknown
}

export function transformComment(
  raw: RawZohoSprintsActivity,
  taskId?: string,
  projectId?: string,
): Comment {
  return {
    id: raw.activityId,
    externalId: raw.activityId,
    taskId: taskId ?? pickStr(raw.itemId),
    projectId: projectId ?? pickStr(raw.projId),
    authorId: pickStr(raw.addedBy) ?? '',
    body: pickStr(raw.description) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.addedTime) ?? new Date(0).toISOString(),
    platform: 'zoho-sprints',
    metadata: strMap({ type: raw.type, sprintId: raw.sprintId }),
    raw,
  }
}
