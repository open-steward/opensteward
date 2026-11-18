/**
 * MantisBT project transform.
 *
 * MantisBT returns project objects from GET /projects with the shape:
 *   { id, name, description, status: { id, name, label }, enabled, file_path,
 *     access_level: { id, name, label }, ...custom_fields }
 *
 * MantisBT has no workspace concept — we use a fixed placeholder ID.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Enum reference used for status, priority, severity, etc. */
interface EnumRef {
  id?: number
  name?: string
  label?: string
  [key: string]: unknown
}

export interface RawMantisbtProject {
  id?: number
  name?: string
  description?: string
  status?: EnumRef | null
  enabled?: boolean
  view_state?: EnumRef | null
  access_level?: EnumRef | null
  [key: string]: unknown
}

function mapStatus(raw: RawMantisbtProject): ProjectStatus {
  if (raw.enabled === false) return 'archived'
  const name = (raw.status?.name ?? '').toLowerCase()
  if (name === 'closed') return 'archived'
  if (name === 'development') return 'active'
  return 'active'
}

export function transformProject(raw: RawMantisbtProject): Project {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: 'default',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'mantisbt',
    metadata: strMap({
      statusLabel: raw.status?.label,
      viewState: raw.view_state?.name,
    }),
    raw,
  }
}

// Re-export toIso for use in other transforms
export { toIso }
