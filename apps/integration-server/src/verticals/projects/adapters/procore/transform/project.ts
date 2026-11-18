import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Procore Project. Returned by `GET /rest/v1.0/projects?company_id=…`.
 * Belongs to a Company (our canonical Workspace). `active` flags whether the
 * project is live; `project_stage` carries lifecycle (e.g. Bidding, Course of
 * Construction, Warranty, Complete).
 */
export interface RawProcoreProject {
  id: number | string
  name?: string
  display_name?: string
  project_number?: string
  description?: string
  active?: boolean
  start_date?: string | null
  completion_date?: string | null
  created_at?: string
  updated_at?: string
  company?: { id?: number | string; name?: string } | null
  project_stage?: { id?: number | string; name?: string } | null
  [key: string]: unknown
}

function mapStatus(raw: RawProcoreProject): ProjectStatus {
  const stage = raw.project_stage?.name?.toLowerCase() ?? ''
  if (stage.includes('complete') || stage.includes('closed')) return 'completed'
  if (stage.includes('warranty') || stage.includes('on hold') || stage.includes('on-hold')) {
    return 'on_hold'
  }
  if (raw.active === false) return 'archived'
  return 'active'
}

export function transformProject(raw: RawProcoreProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: raw.company?.id != null ? String(raw.company.id) : '',
    name: pickStr(raw.display_name ?? raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    startDate: toIso(raw.start_date),
    endDate: toIso(raw.completion_date),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'procore',
    metadata: strMap({
      projectNumber: raw.project_number,
      stage: raw.project_stage?.name,
      companyName: raw.company?.name,
    }),
    raw,
  }
}
