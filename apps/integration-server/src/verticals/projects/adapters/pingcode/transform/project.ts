import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * PingCode agile project (`GET /v1/agile/projects`).
 *
 * `type` is the project methodology — `scrum` / `kanban` / `bug` (defect
 * pool). `is_archived` drives canonical status. Timestamps are epoch seconds.
 */
export interface RawPingcodeProject {
  id: string
  identifier?: string
  name?: string
  description?: string
  type?: string
  is_archived?: boolean
  principal?: { id?: string } | string | null
  created_at?: number | string
  updated_at?: number | string
  created_by?: string
  [key: string]: unknown
}

function principalId(raw: RawPingcodeProject): string | undefined {
  const p = raw.principal
  if (typeof p === 'string') return pickStr(p)
  if (p && typeof p === 'object') return pickStr(p.id)
  return undefined
}

function mapStatus(raw: RawPingcodeProject): ProjectStatus {
  return raw.is_archived ? 'archived' : 'active'
}

export function transformProject(raw: RawPingcodeProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    // PingCode projects belong to the enterprise (the OAuth credential's
    // tenant); there is no per-project workspace entity in the open API.
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: principalId(raw) ?? pickStr(raw.created_by),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'pingcode',
    metadata: strMap({
      identifier: raw.identifier,
      type: raw.type,
    }),
    raw,
  }
}
