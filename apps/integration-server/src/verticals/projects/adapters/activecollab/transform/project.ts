import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * ActiveCollab `Project` object (subset).
 * Timestamps (`created_on`, `updated_on`, `completed_on`) are epoch seconds.
 */
export interface RawActivecollabProject {
  id: number | string
  name?: string
  body?: string
  body_formatted?: string
  is_completed?: boolean
  completed_on?: number | null
  is_trashed?: boolean
  trashed_on?: number | null
  leader_id?: number | null
  company_id?: number | null
  category_id?: number | null
  label_id?: number | null
  members?: Array<number | string>
  budget?: number | null
  count_tasks?: number
  created_on?: number | null
  created_by_id?: number | null
  updated_on?: number | null
  url_path?: string
  [key: string]: unknown
}

function mapStatus(raw: RawActivecollabProject): ProjectStatus {
  if (raw.is_trashed) return 'archived'
  if (raw.is_completed) return 'completed'
  return 'active'
}

export function transformProject(raw: RawActivecollabProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // ActiveCollab has no nested workspace concept — the account *is* the
    // workspace. `company_id` is the closest tenant grouping when present.
    workspaceId: raw.company_id != null ? String(raw.company_id) : '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.body),
    status: mapStatus(raw),
    ownerId: raw.leader_id != null ? String(raw.leader_id) : undefined,
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    platform: 'activecollab',
    metadata: strMap({
      categoryId: raw.category_id,
      labelId: raw.label_id,
      countTasks: raw.count_tasks,
      urlPath: raw.url_path,
    }),
    raw,
  }
}
