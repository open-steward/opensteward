/**
 * Transforms a raw Zoho Sprints item (work item) into the canonical Task schema.
 *
 * Zoho Sprints item response fields (from GET /zsapi/team/{teamId}/projects/{projId}/sprints/{sprintId}/item/):
 *   itemId, itemName, description, statusId, statusName, projPriorityId,
 *   sprintId, projId, ownerId (zpuid), startDate, endDate, createdTime,
 *   createdBy, immediateParentId, parentItem, commentCount, points, duration
 *
 * Priority IDs: Zoho Sprints uses custom priority IDs; we map by name when available.
 * Status: closed when statusName contains "done"/"complete"/"closed"
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoSprintsItem {
  itemId: string
  itemName?: string
  description?: string
  statusId?: string | number
  statusName?: string
  statusType?: string | number
  projPriorityId?: string | number
  priorityName?: string
  sprintId?: string | number
  projId?: string
  ownerId?: string
  zpuid?: string
  startDate?: string | number
  endDate?: string | number
  createdTime?: string | number
  lastModifiedTime?: string | number
  createdBy?: string
  immediateParentId?: string | number
  parentItem?: string | number
  commentCount?: number | string
  points?: number | string
  duration?: number | string
  itemNo?: string | number
  itemTypeName?: string
  [key: string]: unknown
}

function mapStatus(raw: RawZohoSprintsItem): TaskStatus {
  // statusType 3 = Done in Zoho Sprints; also check name
  if (raw.statusType === 3 || raw.statusType === '3') return 'closed'
  const name = (raw.statusName ?? '').toLowerCase()
  if (name.includes('done') || name.includes('complete') || name.includes('closed')) return 'closed'
  if (name.includes('progress') || name.includes('active')) return 'in_progress'
  return 'open'
}

function mapPriority(raw: RawZohoSprintsItem): TaskPriority | undefined {
  const name = (raw.priorityName ?? '').toLowerCase()
  if (name === 'urgent' || name === 'critical') return 'urgent'
  if (name === 'high') return 'high'
  if (name === 'medium' || name === 'normal' || name === 'medium-high') return 'medium'
  if (name === 'low') return 'low'
  return undefined
}

export function transformTask(raw: RawZohoSprintsItem, projectId?: string): Task {
  const pid = projectId ?? pickStr(raw.projId) ?? ''
  // Zoho Sprints parent: immediateParentId=0 means top-level item
  const parentIdRaw = raw.immediateParentId ?? raw.parentItem
  const parentId =
    parentIdRaw !== undefined && String(parentIdRaw) !== '0' && String(parentIdRaw) !== ''
      ? String(parentIdRaw)
      : undefined

  // Assignee: ownerId or zpuid
  const assigneeId = pickStr(raw.ownerId ?? raw.zpuid)

  return {
    id: raw.itemId,
    externalId: raw.itemId,
    projectId: pid,
    parentId,
    title: pickStr(raw.itemName) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.endDate),
    assigneeIds: assigneeId ? [assigneeId] : [],
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.createdTime),
    updatedAt: toIso(raw.lastModifiedTime),
    platform: 'zoho-sprints',
    metadata: strMap({
      sprintId: raw.sprintId,
      statusId: raw.statusId,
      statusName: raw.statusName,
      itemNo: raw.itemNo,
      itemTypeName: raw.itemTypeName,
      points: raw.points,
      commentCount: raw.commentCount,
    }),
    raw,
  }
}
