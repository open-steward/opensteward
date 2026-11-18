/**
 * Transform a Khoros Care work queue into the canonical Team shape.
 *
 * `GET /api/v2/workqueues/active` returns `{ data: [ { archived, description,
 * id, name, uuid } ] }` with an integer `id`. That integer is what a
 * conversation carries in `workQueue.id`, so it is the Team id and ticket
 * `teamId` resolves against it.
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/reference/active-1
 */
import type { Team } from '../../../schema'
import { pickStr, required, strMap } from './shared'

export interface RawKhorosCareWorkQueue {
  id?: number
  uuid?: string
  name?: string
  description?: string | null
  archived?: boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawKhorosCareWorkQueue): Team {
  const id = String(required(raw.id, 'work queue id'))
  return {
    id,
    externalId: id,
    name: required(pickStr(raw.name), `name of work queue ${id}`),
    platform: 'khoros-care',
    metadata: strMap({
      uuid: raw.uuid,
      description: raw.description,
      archived: raw.archived,
    }),
    raw,
  }
}
