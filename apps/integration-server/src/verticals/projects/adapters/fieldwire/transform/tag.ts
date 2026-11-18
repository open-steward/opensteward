/**
 * Fieldwire entity_tag → canonical Tag transform.
 *
 * Fieldwire entity tags are project-scoped label objects that can be
 * applied to tasks and other entities via entity_taggings.
 *
 * entity_tag fields (v3):
 *   id (uuid), name (string), color (string|null),
 *   project_id (uuid), created_at, updated_at
 *
 * Docs: https://developers.fieldwire.com/reference/get_entity_tags_in_project
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFieldwireEntityTag {
  id: string
  name?: string | null
  color?: string | null
  project_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTag(raw: RawFieldwireEntityTag, projectId?: string): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    // Tags are project-scoped in Fieldwire; use project_id as workspaceId
    workspaceId: projectId ?? raw.project_id ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'fieldwire',
    metadata: strMap({}),
    raw,
  }
}
