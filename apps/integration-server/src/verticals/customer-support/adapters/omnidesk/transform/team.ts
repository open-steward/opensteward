/**
 * Transforms an Omnidesk group to the canonical Team schema.
 *
 * Omnidesk group fields: group_id, group_title, group_from_name,
 * group_signature, active, created_at, updated_at.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOmnideskGroup {
  group_id: number
  group_title?: string
  group_from_name?: string | null
  group_signature?: string | null
  active?: boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawOmnideskGroup): Team {
  return {
    id: String(raw.group_id),
    externalId: String(raw.group_id),
    name: pickStr(raw.group_title) ?? '',
    platform: 'omnidesk',
    metadata: strMap({
      fromName: raw.group_from_name,
      active: raw.active,
    }),
    raw,
  }
}
