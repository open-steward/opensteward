import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * awork returns project tags from GET /projects/tags as BaseTagModelWithCount
 * objects. Tags are name-keyed globally (no uuid exposed at the list level);
 * we synthesise a stable id from the tag name so the canonical Tag.id field
 * is always populated.
 */
export interface RawAworkProjectTag {
  name?: string | null
  color?: string | null
  usageCount?: number
  [key: string]: unknown
}

/** Produce a stable, URL-safe id from the tag name. */
function tagId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '')
}

export function transformTag(raw: RawAworkProjectTag): Tag {
  const name = pickStr(raw.name) ?? ''
  const id = tagId(name) || name
  return {
    id,
    externalId: id,
    // awork is single-workspace per account; callers pass workspaceId as a
    // hint — we surface it unchanged.
    workspaceId: '',
    name,
    color: pickStr(raw.color),
    platform: 'awork',
    metadata: strMap({ usageCount: raw.usageCount }),
    raw,
  }
}
