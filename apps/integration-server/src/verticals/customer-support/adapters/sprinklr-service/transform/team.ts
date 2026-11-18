/**
 * Transform Sprinklr Service queue → canonical Team.
 *
 * Queues are fetched via GET /api/v1/bootstrap/resources?types=CLIENT_QUEUES.
 * Key fields: id, name, description
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSprinklrQueue {
  id?: string | number
  name?: string
  description?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawSprinklrQueue): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'sprinklr-service',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
