import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Workfront `group` (objCode `GROUP`) record. Workfront has no
 * single "workspace" entity; the closest organisational container is a
 * Group — projects carry `groupID` and users a `homeGroupID`.
 */
export interface RawWorkfrontGroup {
  ID: string
  name?: string
  description?: string
  parentID?: string | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawWorkfrontGroup): Workspace {
  return {
    id: raw.ID,
    externalId: raw.ID,
    name: pickStr(raw.name) ?? '',
    platform: 'workfront',
    metadata: strMap({
      description: raw.description,
      parentID: raw.parentID,
    }),
    raw,
  }
}
