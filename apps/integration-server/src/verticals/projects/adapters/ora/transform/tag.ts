/**
 * Ora label (tag) transform.
 *
 * In Ora, "labels" are the canonical tagging mechanism for tasks.
 * Labels are scoped to a project and returned from:
 *   GET /projects/:project_id/labels
 *
 * Fields: id, name, color, project_id
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOraLabel {
  id: string | number
  name?: string
  color?: string
  project_id?: string | number
  [key: string]: unknown
}

export function transformTag(raw: RawOraLabel, workspaceId?: string): Tag {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    workspaceId: raw.project_id != null ? String(raw.project_id) : (workspaceId ?? ''),
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'ora',
    metadata: strMap({}),
    raw,
  }
}
