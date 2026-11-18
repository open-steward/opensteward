/**
 * Transform a Zoho BugTracker tag into the canonical Tag shape.
 *
 * GET /api/v3/portal/[PORTALID]/tags
 * Docs: https://www.zoho.com/projects/help/rest-api/bugtracker-tags-api.html
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZohoBugtrackerTagCreatedBy {
  id?: string | number
  zpuid?: string | number
  name?: string
  email?: string
  is_client_user?: boolean
  zuidString?: string
}

export interface RawZohoBugtrackerTag {
  id: string | number
  id_string?: string
  name?: string
  /** CSS-style color class name returned by the API (e.g. "tag_color1") */
  color_class?: string
  created_by?: RawZohoBugtrackerTagCreatedBy
  [key: string]: unknown
}

export function transformTag(raw: RawZohoBugtrackerTag, portalId: string): Tag {
  const id = pickStr(raw.id_string) ?? String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId: portalId,
    name: pickStr(raw.name) ?? '',
    // color_class is a class name like "tag_color1" — pass through as-is
    color: pickStr(raw.color_class),
    platform: 'zoho-bugtracker',
    metadata: strMap({
      colorClass: raw.color_class,
      createdByName: raw.created_by?.name,
      createdById: raw.created_by?.id != null ? String(raw.created_by.id) : undefined,
    }),
    raw,
  }
}
