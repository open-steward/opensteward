/**
 * Transform a raw Scoro project into the canonical Project schema.
 *
 * Scoro project key fields (API v2):
 *   project_id          – integer identifier
 *   project_name        – display name
 *   description         – free-text description
 *   status              – opaque string slug (e.g. "task_status1")
 *   manager_id          – integer user ID of the project manager
 *   project_start_date  – "YYYY-MM-DD"
 *   project_end_date    – "YYYY-MM-DD"
 *   created_date        – "YYYY-MM-DD HH:mm:ss"
 *   modified_date       – "YYYY-MM-DD HH:mm:ss"
 *   company_id          – associated client company (closest to workspace)
 *   project_type        – "regular" | "retainer" | "internal"
 *   is_deleted          – boolean / "1"
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawScoroProject {
  project_id?: number | string
  project_name?: string
  description?: string
  status?: string
  manager_id?: number | string
  project_start_date?: string
  project_end_date?: string
  created_date?: string
  modified_date?: string
  company_id?: number | string
  project_type?: string
  is_deleted?: boolean | string | number
  [key: string]: unknown
}

function mapStatus(raw: RawScoroProject): ProjectStatus {
  if (raw.is_deleted === true || raw.is_deleted === 1 || raw.is_deleted === '1') return 'archived'
  const s = (raw.status ?? '').toLowerCase()
  if (s.includes('done') || s.includes('completed') || s.includes('finished')) return 'completed'
  if (s.includes('hold') || s.includes('paused') || s.includes('inactive')) return 'on_hold'
  if (s.includes('cancel') || s.includes('archived')) return 'archived'
  // Scoro uses opaque slugs like "task_status1"; default to active for any open status
  return 'active'
}

export function transformProject(raw: RawScoroProject): Project {
  const id = String(raw.project_id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: raw.company_id != null ? String(raw.company_id) : '',
    name: pickStr(raw.project_name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.manager_id != null ? String(raw.manager_id) : undefined,
    startDate: toIso(raw.project_start_date),
    endDate: toIso(raw.project_end_date),
    createdAt: toIso(raw.created_date),
    updatedAt: toIso(raw.modified_date),
    platform: 'scoro',
    metadata: strMap({
      projectType: raw.project_type,
      status: raw.status,
    }),
    raw,
  }
}
