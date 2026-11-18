import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * NocoDB workspace response from GET /api/v2/meta/workspaces
 * and GET /api/v2/meta/workspaces/{workspaceId}
 */
export interface RawNocodbWorkspace {
  id: string
  title?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawNocodbWorkspace): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.title) ?? '',
    platform: 'nocodb',
    metadata: strMap({
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    }),
    raw,
  }
}
