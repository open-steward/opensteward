/**
 * Tiledesk department (team) transform.
 *
 * GET /v3/:project_id/departments
 * Response fields: _id, name, status (1=visible, 0=invisible), routing,
 * online_msg, offline_msg, default, createdAt, updatedAt.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTiledeskDepartment {
  _id?: string
  name?: string
  status?: number | null
  routing?: string | null
  default?: boolean | null
  online_msg?: string | null
  offline_msg?: string | null
  id_project?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawTiledeskDepartment): Team {
  const id = pickStr(raw._id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'tiledesk',
    metadata: strMap({
      routing: raw.routing,
      isDefault: raw.default,
      status: raw.status,
      onlineMsg: raw.online_msg,
      createdAt: toIso(raw.createdAt),
    }),
    raw,
  }
}
