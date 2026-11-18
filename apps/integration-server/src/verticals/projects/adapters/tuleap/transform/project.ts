import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Tuleap project object returned by GET /api/projects and GET /api/projects/{id}.
 *
 * Relevant fields:
 *   id          - numeric project identifier
 *   uri         - e.g. "projects/110"
 *   label       - human-readable name
 *   shortname   - URL slug
 *   description - optional description string
 *   is_public   - boolean visibility flag
 *   status      - "A" (active) | "H" (hidden/on_hold) | "D" (deleted/archived)
 *   access      - "public" | "private" | "public-unrestricted" | "private-wo-restr"
 */
export interface RawTuleapProject {
  id: number
  uri?: string
  label?: string
  shortname?: string
  description?: string
  is_public?: boolean
  status?: string
  access?: string
  [key: string]: unknown
}

function mapStatus(raw: RawTuleapProject): ProjectStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'D') return 'archived'
  if (s === 'H') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawTuleapProject): Project {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.label) ?? pickStr(raw.shortname) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'tuleap',
    metadata: strMap({
      shortname: raw.shortname,
      access: raw.access,
      isPublic: raw.is_public,
      uri: raw.uri,
    }),
    raw,
  }
}
