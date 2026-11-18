import type { Workspace } from '../../../schema'
import { pickStr, pickNum, strMap } from './shared'

/**
 * awork workspace model returned by GET /workspaces/{workspaceId}.
 * Fields sourced from the Workspace OpenAPI schema (GET model).
 */
export interface RawAworkWorkspace {
  id: string
  name?: string | null
  description?: string | null
  type?: string | null
  memberCount?: number | null
  createdOn?: string
  updatedOn?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawAworkWorkspace): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    memberCount: pickNum(raw.memberCount),
    platform: 'awork',
    metadata: strMap({
      description: raw.description,
      type: raw.type,
    }),
    raw,
  }
}
