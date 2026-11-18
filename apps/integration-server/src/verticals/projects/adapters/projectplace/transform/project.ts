import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Projectplace project (workspace). Returned by `GET /1/user/me/projects`
 * (list items) and `GET /1/projects/{id}` (detail). Timestamps are Unix
 * epoch seconds.
 */
export interface RawProjectplaceProject {
  id: number | string
  name?: string
  description?: string
  archived?: boolean
  is_archived?: boolean
  status?: string
  owner?: { id: number | string; name?: string } | null
  owner_id?: number | string | null
  start_time?: number | string
  due_time?: number | string
  create_time?: number | string
  created_time?: number | string
  modify_time?: number | string
  modified_time?: number | string
  [key: string]: unknown
}

/** Epoch-seconds → ISO. Projectplace timestamps are Unix seconds. */
function epochToIso(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return toIso(new Date(v * 1000).toISOString())
  if (typeof v === 'string' && /^\d+$/.test(v)) return toIso(new Date(Number(v) * 1000).toISOString())
  return toIso(v)
}

function mapStatus(raw: RawProjectplaceProject): ProjectStatus {
  if (raw.archived || raw.is_archived) return 'archived'
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'completed' || s === 'closed' || s === 'done') return 'completed'
  if (s === 'on_hold' || s === 'paused') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawProjectplaceProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.owner?.id ?? raw.owner_id),
    startDate: epochToIso(raw.start_time),
    endDate: epochToIso(raw.due_time),
    createdAt: epochToIso(raw.create_time ?? raw.created_time),
    updatedAt: epochToIso(raw.modify_time ?? raw.modified_time),
    platform: 'projectplace',
    metadata: strMap({}),
    raw,
  }
}
