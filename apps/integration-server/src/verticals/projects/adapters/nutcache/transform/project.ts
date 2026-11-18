import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Nutcache project status codes:
 *   0 = Planned, 1 = In progress, 2 = Completed, 3 = Canceled, 4 = Archived
 *
 * Canonical ProjectStatus values: active | archived | completed | on_hold | unknown
 */
export interface RawNutcacheProject {
  id: number
  type?: string
  name?: string
  description?: string
  vision?: string
  status?: number
  project_type?: number
  display_color?: string
  start_date?: string
  end_date?: string
  organization?: number
  customer?: number
  [key: string]: unknown
}

function mapStatus(raw: RawNutcacheProject): ProjectStatus {
  switch (raw.status) {
    case 0:
      return 'on_hold'
    case 1:
      return 'active'
    case 2:
      return 'completed'
    case 3:
      return 'archived'
    case 4:
      return 'archived'
    default:
      return 'unknown'
  }
}

export function transformProject(raw: RawNutcacheProject): Project {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId: raw.organization != null ? String(raw.organization) : '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    startDate: toIso(raw.start_date),
    endDate: toIso(raw.end_date),
    platform: 'nutcache',
    metadata: strMap({
      displayColor: raw.display_color,
      projectType: raw.project_type,
      vision: raw.vision,
      customerId: raw.customer,
    }),
    raw,
  }
}
