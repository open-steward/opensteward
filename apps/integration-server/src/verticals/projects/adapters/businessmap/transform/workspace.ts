/**
 * Businessmap workspace → canonical Workspace transform.
 *
 * API v2 GET /workspaces  →  { data: [ { workspace_id, name, description } ] }
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawBusinessmapWorkspace {
  workspace_id?: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawBusinessmapWorkspace): Workspace {
  const id = String(raw.workspace_id ?? '')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'businessmap',
    metadata: strMap({
      description: raw.description,
    }),
    raw,
  }
}
