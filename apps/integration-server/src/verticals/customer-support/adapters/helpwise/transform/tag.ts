/**
 * Helpwise tag -> canonical Tag transform.
 *
 * Documented V1 shape ("Get Tags" GET /tags and "Get Tag" GET /tags/{tagId},
 * https://documenter.getpostman.com/view/29744652/2s9YC5yYKf): `id`, `name`,
 * `color`, `parentId`, `hierarchy`, `inbox`, `createdAt`, `pinnedBy`.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpwiseTag {
  id: number | string
  name: string
  color?: string | null
  parentId?: number | string | null
  inbox?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawHelpwiseTag): Tag {
  if (raw.id === undefined || raw.id === null || raw.id === '') {
    throw new Error('Helpwise tag has no tag id')
  }
  const id = String(raw.id)
  const name = pickStr(raw.name)
  if (name === undefined) {
    throw new Error(`Helpwise tag ${id} has no tag name`)
  }
  return {
    id,
    externalId: id,
    name,
    color: pickStr(raw.color),
    platform: 'helpwise',
    metadata: strMap({ parentId: raw.parentId, inbox: raw.inbox, createdAt: raw.createdAt }),
    raw,
  }
}
