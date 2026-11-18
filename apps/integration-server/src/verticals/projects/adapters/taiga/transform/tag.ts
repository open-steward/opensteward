/**
 * Taiga tag transform.
 *
 * Taiga tags are project-scoped. They are returned as part of the project
 * object's `tags_colors` map (tag_name → hex_color | null).
 * We synthesise a stable id from "{projectId}:{tagName}".
 *
 * Docs: https://docs.taiga.io/api.html#projects-tags-colors
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTaigaTag {
  name: string
  color?: string | null
  projectId: string
}

export function transformTag(raw: RawTaigaTag): Tag {
  const syntheticId = `${raw.projectId}:${raw.name}`
  return {
    id: syntheticId,
    externalId: syntheticId,
    workspaceId: raw.projectId,
    name: pickStr(raw.name) ?? '',
    color: raw.color != null ? pickStr(raw.color) : undefined,
    platform: 'taiga',
    metadata: strMap({}),
    raw,
  }
}

/**
 * Expand a project's tags_colors map into RawTaigaTag records.
 * Returns one RawTaigaTag per entry in the map.
 */
export function expandTagsColors(
  tagsColors: Record<string, string | null>,
  projectId: string,
): RawTaigaTag[] {
  return Object.entries(tagsColors).map(([name, color]) => ({
    name,
    color: color ?? undefined,
    projectId,
  }))
}
