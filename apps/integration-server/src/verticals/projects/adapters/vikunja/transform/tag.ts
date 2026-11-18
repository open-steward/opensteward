import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Vikunja Label object returned by GET /labels and GET /labels/{id}.
 *
 * Fields sourced from pkg/models/label.go:
 *   id, title, description, hex_color, created_by, created, updated.
 *
 * Vikunja labels are user-owned, not workspace-scoped; we use '0' as a
 * placeholder workspace id.
 */
export interface RawVikunjaLabel {
  id: number
  title?: string
  description?: string
  hex_color?: string
  created_by?: {
    id?: number
    username?: string
    name?: string
    [key: string]: unknown
  } | null
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformTag(raw: RawVikunjaLabel): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // Vikunja labels are not scoped to a workspace; use a sentinel value.
    workspaceId: '0',
    name: pickStr(raw.title) ?? '',
    color: pickStr(raw.hex_color),
    platform: 'vikunja',
    metadata: strMap({
      description: raw.description,
      createdByUsername: raw.created_by?.username,
    }),
    raw,
  }
}
