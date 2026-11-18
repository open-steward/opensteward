import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLarkProject {
  gid: string
  name?: string
  notes?: string
  archived?: boolean
  current_status?: { color?: string; text?: string } | null
  owner?: { gid: string }
  workspace?: { gid: string; name?: string }
  start_on?: string
  due_on?: string
  created_at?: string
  modified_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawLarkProject): ProjectStatus {
  if (raw.archived) return 'archived'
  const color = raw.current_status?.color
  if (color === 'green') return 'active'
  if (color === 'blue') return 'on_hold'
  if (color === 'red') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawLarkProject): Project {
  return {
    id: raw.gid,
    externalId: raw.gid,
    workspaceId: raw.workspace?.gid ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.notes),
    status: mapStatus(raw),
    ownerId: pickStr(raw.owner?.gid),
    startDate: toIso(raw.start_on),
    endDate: toIso(raw.due_on),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.modified_at),
    platform: 'lark',
    metadata: strMap({}),
    raw,
  }
}
