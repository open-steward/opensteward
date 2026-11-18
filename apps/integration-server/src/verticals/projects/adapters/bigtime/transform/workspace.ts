import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * BigTime firm entry (`GET /session/firms`).
 *
 * BigTime is a single-tenant SaaS where the "firm" is the top-level
 * organisational unit — the closest analogue to a canonical workspace.
 * The list endpoint returns a bare array of `{id, name}` objects; there is
 * no detail endpoint beyond what the session returns.
 */
export interface RawBigtimeFirm {
  id?: string | number
  name?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawBigtimeFirm): Workspace {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? id,
    platform: 'bigtime',
    metadata: strMap({ firmId: raw.id }),
    raw,
  }
}
