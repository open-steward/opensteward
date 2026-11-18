/**
 * Helpshift queue/team transform.
 *
 * Helpshift uses "queues" as team/group concepts. Issues are assigned to queues.
 * Queues are returned in the issue payload and via GET /{domain}/queues (if available).
 *
 * Key fields:
 *   id   — string queue ID
 *   name — queue name
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpshiftQueue {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawHelpshiftQueue): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'helpshift',
    metadata: strMap({}),
    raw,
  }
}
