/**
 * Fieldwire task → canonical Task transform.
 *
 * Fieldwire task fields (v3):
 *   id (uuid), name, project_id, team_id, floorplan_id,
 *   creator_user_id, owner_user_id, user_ids,
 *   priority (int32: 1=high, 2=medium, 3=low),
 *   status_id (uuid, references custom status),
 *   due_date (date), due_at (datetime), start_at, end_at,
 *   fixed_at (completed datetime), verified_at,
 *   device_created_at, device_updated_at,
 *   is_local, cost_value, man_power_value, pos_x/y/z
 *
 * Status mapping: fixed_at → closed, verified_at → closed,
 *   otherwise open (status_id resolution would require extra API call).
 *
 * Priority: 1 → high, 2 → medium, 3 → low (Fieldwire integer priorities).
 *
 * Docs: https://developers.fieldwire.com/reference/add_tasks_for_teams
 */
import type { Task, TaskStatus, TaskPriority } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFieldwireTask {
  id: string
  name?: string | null
  project_id?: string
  team_id?: string | null
  floorplan_id?: string | null
  creator_user_id?: number | null
  owner_user_id?: number | null
  user_ids?: number[] | null
  /** Integer priority: 1=high, 2=medium, 3=low */
  priority?: number | null
  status_id?: string | null
  due_date?: string | null
  due_at?: string | null
  start_at?: string | null
  end_at?: string | null
  fixed_at?: string | null
  verified_at?: string | null
  device_created_at?: string
  device_updated_at?: string
  is_local?: boolean
  [key: string]: unknown
}

function mapStatus(raw: RawFieldwireTask): TaskStatus {
  if (raw.verified_at) return 'closed'
  if (raw.fixed_at) return 'closed'
  return 'open'
}

function mapPriority(raw: RawFieldwireTask): TaskPriority | undefined {
  // Fieldwire priority: 1=high, 2=medium, 3=low (no urgent at the int level)
  switch (raw.priority) {
    case 1:
      return 'high'
    case 2:
      return 'medium'
    case 3:
      return 'low'
    default:
      return undefined
  }
}

export function transformTask(raw: RawFieldwireTask, projectId?: string): Task {
  const pid = projectId ?? raw.project_id ?? ''
  const assigneeIds: string[] = []
  if (raw.owner_user_id != null) assigneeIds.push(String(raw.owner_user_id))
  // Include additional collaborator user_ids if present and not already the owner
  for (const uid of raw.user_ids ?? []) {
    const s = String(uid)
    if (!assigneeIds.includes(s)) assigneeIds.push(s)
  }

  return {
    id: raw.id,
    externalId: raw.id,
    projectId: pid,
    parentId: undefined,
    title: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    priority: mapPriority(raw),
    dueDate: toIso(raw.due_at ?? raw.due_date),
    assigneeIds,
    tagIds: [],
    subtaskCount: undefined,
    createdAt: toIso(raw.device_created_at),
    updatedAt: toIso(raw.device_updated_at),
    platform: 'fieldwire',
    metadata: strMap({
      teamId: raw.team_id,
      floorplanId: raw.floorplan_id,
      statusId: raw.status_id,
      creatorUserId: raw.creator_user_id,
      isLocal: raw.is_local,
    }),
    raw,
  }
}
