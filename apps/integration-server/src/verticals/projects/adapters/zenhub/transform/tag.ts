import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * ZenHub label — mapped to the canonical Tag.
 *
 * Labels in ZenHub are GitHub labels surfaced through the GraphQL API.
 * They live on repositories, not workspaces, so `workspaceId` is filled
 * with the repository (project) id that owns the label.
 *
 * GraphQL shape (from `repository.labels.nodes` or `issue.labels.nodes`):
 *   id     String
 *   name   String
 *   color  String?  (hex colour code, e.g. "e4e669")
 */
export interface RawZenhubLabel {
  id: string
  name?: string
  color?: string
  [key: string]: unknown
}

export function transformTag(raw: RawZenhubLabel, repositoryId?: string): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: repositoryId ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'zenhub',
    metadata: strMap({}),
    raw,
  }
}
