import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Meisterplan "scenario" → canonical Workspace.
 *
 * In Meisterplan's model a scenario is a named planning context (e.g.
 * "Plan of Record").  The canonical workspace maps naturally to it because
 * all project data is scenario-scoped.  The special sentinel `PlanOfRecord`
 * can be used as a scenario ID to reference the master scenario.
 *
 * Key API fields: id, name
 */
export interface RawMeisterplanScenario {
  id: string
  name?: string | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawMeisterplanScenario): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? raw.id,
    platform: 'meisterplan',
    metadata: strMap({}),
    raw,
  }
}
