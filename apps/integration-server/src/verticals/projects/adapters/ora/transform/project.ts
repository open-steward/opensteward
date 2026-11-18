/**
 * Ora project transform.
 *
 * Ora API project fields (from GET /projects):
 *   id, name, description, archived (boolean), organization_id,
 *   owner_id, created_at, updated_at
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawOraProject {
  id: string | number
  name?: string
  description?: string
  archived?: boolean
  /** The parent organisation / workspace */
  organization_id?: string | number
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawOraProject): ProjectStatus {
  if (raw.archived) return 'archived'
  return 'active'
}

export function transformProject(raw: RawOraProject): Project {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId: raw.organization_id != null ? String(raw.organization_id) : '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.owner_id != null ? String(raw.owner_id) : undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'ora',
    metadata: strMap({}),
    raw,
  }
}
