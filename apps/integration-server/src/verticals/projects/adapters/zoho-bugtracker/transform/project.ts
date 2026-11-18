/**
 * Transform a Zoho BugTracker project into the canonical Project shape.
 *
 * GET /restapi/portal/[PORTALID]/projects/
 * GET /restapi/portal/[PORTALID]/projects/[PROJECTID]/
 * Docs: https://www.zoho.com/projects/help/rest-api/bugtracker-projects-api.html
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoBugtrackerProject {
  id: string | number
  id_string?: string
  name?: string
  description?: string
  status?: string
  owner_id?: string | number
  owner_name?: string
  created_date?: string
  created_date_long?: number
  created_date_format?: string
  start_date?: string
  start_date_long?: number
  end_date?: string
  end_date_long?: number
  last_modified_date?: string
  bug_count?: { open?: number; closed?: number }
  workspace_id?: string | number
  [key: string]: unknown
}

function mapStatus(raw: RawZohoBugtrackerProject): ProjectStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'archived') return 'archived'
  if (s === 'active') return 'active'
  if (s === 'template') return 'archived'
  return 'active'
}

export function transformProject(raw: RawZohoBugtrackerProject, portalId?: string): Project {
  const id = pickStr(raw.id_string) ?? String(raw.id)
  const workspaceId = portalId ?? (raw.workspace_id != null ? String(raw.workspace_id) : '')
  return {
    id,
    externalId: id,
    workspaceId,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.owner_id != null ? String(raw.owner_id) : undefined,
    startDate: toIso(raw.start_date_long ?? raw.start_date),
    endDate: toIso(raw.end_date_long ?? raw.end_date),
    createdAt: toIso(raw.created_date_long ?? raw.created_date),
    updatedAt: toIso(raw.last_modified_date),
    platform: 'zoho-bugtracker',
    metadata: strMap({
      ownerName: raw.owner_name,
      openBugs: raw.bug_count?.open,
      closedBugs: raw.bug_count?.closed,
    }),
    raw,
  }
}
