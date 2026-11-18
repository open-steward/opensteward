/**
 * Weekdone objective → canonical Project.
 *
 * GET /objective returns:
 *   { status: 'ok', data: [{ id, description, type, progress, results, ... }] }
 *
 * Weekdone does not have a native "project" concept; OKR objectives are the
 * closest structural match. Teams serve as the workspace grouping.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawWeekdoneObjective {
  id: number | string
  description?: string
  type?: string            // 'company' | 'department' | 'team' | 'personal'
  progress?: number        // 0–100
  team_id?: number | string
  user_id?: number | string
  due_on?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawWeekdoneObjective): ProjectStatus {
  const progress = pickNum(raw.progress) ?? 0
  if (progress >= 100) return 'completed'
  if (progress > 0) return 'active'
  return 'active'
}

export function transformProject(raw: RawWeekdoneObjective): Project {
  const id = String(raw.id)
  const teamId = raw.team_id != null ? String(raw.team_id) : ''
  return {
    id,
    externalId: id,
    workspaceId: teamId,
    name: pickStr(raw.description) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: raw.user_id != null ? String(raw.user_id) : undefined,
    startDate: undefined,
    endDate: toIso(raw.due_on),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'weekdone',
    metadata: strMap({
      objectiveType: raw.type,
      progress: raw.progress,
    }),
    raw,
  }
}
