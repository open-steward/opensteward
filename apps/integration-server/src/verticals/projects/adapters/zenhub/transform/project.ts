import type { Project } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * ZenHub repository — mapped to the canonical Project.
 *
 * ZenHub organises work inside GitHub repositories attached to workspaces.
 * Repositories are the closest concept to a "project": they contain pipelines,
 * issues (tasks), labels (tags), and sprints.
 *
 * GraphQL shape (from `workspace.repositoriesConnection.nodes`):
 *   id       String   (ZenHub internal id)
 *   ghId     Int      (GitHub repo integer id)
 *   name     String   (repo slug, e.g. "my-repo")
 *   fullPath String?  (e.g. "org/my-repo")
 */
export interface RawZenhubRepository {
  id: string
  ghId?: number | string
  name?: string
  fullPath?: string
  [key: string]: unknown
}

export function transformProject(raw: RawZenhubRepository, workspaceId?: string): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: workspaceId ?? '',
    name: pickStr(raw.fullPath ?? raw.name) ?? '',
    status: 'active',
    platform: 'zenhub',
    metadata: strMap({
      ghId: raw.ghId,
      name: raw.name,
    }),
    raw,
  }
}
