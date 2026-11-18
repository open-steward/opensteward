/**
 * Kaiten tag → canonical Tag.
 *
 * Tag fields (from GET /tags):
 *   id, name, color (integer color code), company_id,
 *   created, updated, archived
 *
 * Kaiten tags are company-wide (no per-space scope), so workspaceId is left
 * empty; the `company_id` is preserved in metadata.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKaitenTag {
  id: number
  name?: string
  /** Numeric color representation (e.g. 0xFF5733). */
  color?: number
  company_id?: number
  created?: string
  updated?: string
  archived?: boolean
  [key: string]: unknown
}

export function transformTag(raw: RawKaitenTag): Tag {
  const id = String(raw.id)
  // Convert numeric color to hex CSS string if present.
  const colorHex =
    typeof raw.color === 'number'
      ? `#${raw.color.toString(16).padStart(6, '0')}`
      : undefined

  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    color: colorHex,
    platform: 'kaiten',
    metadata: strMap({
      companyId: raw.company_id,
      archived: raw.archived,
      createdAt: toIso(raw.created),
      updatedAt: toIso(raw.updated),
    }),
    raw,
  }
}
