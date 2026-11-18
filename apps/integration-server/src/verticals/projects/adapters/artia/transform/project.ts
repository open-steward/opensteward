/**
 * Transform an Artia Folder into the canonical Project shape.
 *
 * In Artia, "Folders" (pasta/project) are the top-level project containers
 * returned by the `listingFolders` query. Each folder has an id, name, and
 * optional description; status is inferred from the `status` field.
 *
 * Artia folder fields used here:
 *   id, name, description, status, createdAt, updatedAt, accountId
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawArtiaFolder {
  id: string | number
  name?: string
  description?: string
  status?: string | null
  createdAt?: string
  updatedAt?: string
  accountId?: string | number | null
  [key: string]: unknown
}

function mapStatus(raw: RawArtiaFolder): ProjectStatus {
  const s = (raw.status ?? '').toString().toLowerCase()
  if (s === 'archived' || s === 'inactive' || s === 'closed') return 'archived'
  if (s === 'on_hold' || s === 'paused' || s === 'suspended') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawArtiaFolder): Project {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId: raw.accountId != null ? String(raw.accountId) : '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'artia',
    metadata: strMap({ rawStatus: raw.status }),
    raw,
  }
}
