/**
 * Transform a Zoho BugTracker portal into the canonical Workspace shape.
 *
 * Portals are the top-level org container in Zoho BugTracker.
 * GET /restapi/portals/ returns an array of portal objects.
 * Docs: https://www.zoho.com/projects/help/rest-api/bugtracker-portal-api.html
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZohoBugtrackerPortal {
  id: string | number
  id_string?: string
  name?: string
  company_name?: string
  website_url?: string
  time_zone?: string
  date_format?: string
  gmt_time_zone?: string
  role?: string
  default?: boolean
  project_count?: {
    template?: number
    archived?: number
    active?: number
  }
  [key: string]: unknown
}

export function transformWorkspace(raw: RawZohoBugtrackerPortal): Workspace {
  const id = pickStr(raw.id_string) ?? String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? pickStr(raw.company_name) ?? '',
    platform: 'zoho-bugtracker',
    metadata: strMap({
      companyName: raw.company_name,
      timeZone: raw.time_zone,
      gmtTimeZone: raw.gmt_time_zone,
      role: raw.role,
      isDefault: raw.default,
      activeProjects: raw.project_count?.active,
      archivedProjects: raw.project_count?.archived,
    }),
    raw,
  }
}
