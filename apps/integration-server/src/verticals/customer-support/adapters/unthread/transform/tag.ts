/**
 * Transform an Unthread tag object into the canonical Tag schema.
 *
 * Unthread tags have id, name, description, autoTaggingEnabled, projectId.
 * The id is a UUID string.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUnthreadTag {
  id: string
  name?: string | null
  description?: string | null
  autoTaggingEnabled?: boolean | null
  projectId?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawUnthreadTag): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    color: undefined,
    platform: 'unthread',
    metadata: strMap({
      description: raw.description,
      autoTaggingEnabled: raw.autoTaggingEnabled,
      projectId: raw.projectId,
    }),
    raw,
  }
}
