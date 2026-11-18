/**
 * SmartTask "organization" maps to the canonical Workspace.
 *
 * GET /organization/list returns:
 *   { organization_id: number, name: string }
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSmarttaskOrganization {
  organization_id: number | string
  name?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawSmarttaskOrganization): Workspace {
  const id = String(raw.organization_id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'smarttask',
    metadata: strMap({}),
    raw,
  }
}
