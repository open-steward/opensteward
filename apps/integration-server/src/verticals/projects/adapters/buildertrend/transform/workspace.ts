import type { Workspace } from '../../../schema'
import { pickStr, pickNum, strMap } from './shared'

/**
 * Buildertrend "Builder" account — the tenant that owns all jobs and users.
 * Maps to the canonical Workspace.
 */
export interface RawBuildertrendBuilder {
  id: number | string
  name?: string
  companyName?: string
  builderName?: string
  userCount?: number
  [key: string]: unknown
}

export function transformWorkspace(raw: RawBuildertrendBuilder): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.companyName ?? raw.builderName ?? raw.name) ?? '',
    memberCount: pickNum(raw.userCount),
    platform: 'buildertrend',
    metadata: strMap({}),
    raw,
  }
}
