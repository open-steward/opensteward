/**
 * GanttPRO workspace transform.
 *
 * GanttPRO does not expose a traditional "workspace" resource. The closest
 * analogue is the team object returned by GET /team (id, ownerId, name).
 * We map it to the canonical Workspace schema.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGanttproTeam {
  id: number | string
  ownerId?: number | string
  name?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawGanttproTeam): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'ganttpro',
    metadata: strMap({
      ownerId: raw.ownerId,
    }),
    raw,
  }
}
