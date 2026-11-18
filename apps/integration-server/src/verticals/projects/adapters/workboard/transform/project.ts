import type { Project, ProjectStatus } from '../../../schema'
import { requiredName, strMap, unambiguousIso } from './shared'

/**
 * A WorkBoard goal (objective), mapped to the canonical Project.
 *
 * Fields as documented for GET /wb/apis/goal and GET /wb/apis/goal/{goal_id}
 * (https://apidocs.myworkboard.com/openapi.json): every one is typed
 * `string`. The goal list nests these under `people_goals` of each user.
 */
export interface RawWorkboardGoal {
  goal_id?: string
  goal_name?: string
  goal_narrative?: string
  goal_owner?: string
  goal_owner_full_name?: string
  goal_create_at?: string
  goal_modified_at?: string
  goal_start_date?: string
  goal_target_date?: string
  goal_progress?: string
  /** "The status of the goal. Possible values are 1 = active and 2 = closed." */
  goal_status?: string
  goal_team_id?: string
  goal_team_name?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): ProjectStatus {
  if (s === '1') return 'active'
  if (s === '2') return 'completed'
  return 'unknown'
}

export function transformProject(raw: RawWorkboardGoal): Project {
  if (raw.goal_id == null || raw.goal_id === '') throw new Error('WorkBoard goal has no goal_id')
  const id = String(raw.goal_id)
  return {
    id,
    externalId: id,
    // A personal goal (`goal_type` "2" (Personal goal)) has no team: the spec
    // types `goal_team_id` as `{"type":"string","nullable":true}` on the
    // user goal reads. The canonical workspaceId is a required string, so a
    // goal with no team has the empty workspace, as elsewhere in this vertical.
    workspaceId: raw.goal_team_id ? String(raw.goal_team_id) : '',
    name: requiredName(raw.goal_name, 'goal', id),
    description: raw.goal_narrative || undefined,
    status: mapStatus(raw.goal_status != null ? String(raw.goal_status) : undefined),
    ownerId: raw.goal_owner ? String(raw.goal_owner) : undefined,
    startDate: unambiguousIso(raw.goal_start_date),
    endDate: unambiguousIso(raw.goal_target_date),
    createdAt: unambiguousIso(raw.goal_create_at),
    updatedAt: unambiguousIso(raw.goal_modified_at),
    platform: 'workboard',
    metadata: strMap({
      goal_progress: raw.goal_progress,
      goal_team_name: raw.goal_team_name,
      goal_owner_full_name: raw.goal_owner_full_name,
    }),
    raw,
  }
}
