/**
 * Weekdone tag → canonical Tag.
 *
 * GET /tag returns:
 *   { status: 'ok', tags: [{ id, tag, status, ... }] }
 *
 * The tag label is in the `tag` field (not `name`).
 * `status` is an object: { status_text, updated, user_id }.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawWeekdoneTag {
  id: number | string
  /** Tag label text — the API field name is `tag`, not `name`. */
  tag?: string
  color?: string
  team_id?: number | string
  [key: string]: unknown
}

export function transformTag(raw: RawWeekdoneTag): Tag {
  const id = String(raw.id)
  const teamId = raw.team_id != null ? String(raw.team_id) : ''
  return {
    id,
    externalId: id,
    workspaceId: teamId,
    name: pickStr(raw.tag) ?? '',
    color: pickStr(raw.color),
    platform: 'weekdone',
    metadata: strMap({}),
    raw,
  }
}
