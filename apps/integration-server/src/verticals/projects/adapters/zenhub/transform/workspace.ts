import type { Workspace } from '../../../schema'
import { strMap } from './shared'

/**
 * ZenHub workspace, from `ZenhubOrganization.workspaces` and `workspace(id)`
 * in the public GraphQL schema
 * (https://developers.zenhub.com/schema/zenhub-public-api.graphql):
 *
 *   type Workspace { id: ID!  name: String  displayName: String!  description: String ... }
 *
 * `name` is nullable and `displayName` is not, so the canonical name reads
 * `displayName`. `name` and `description` go to metadata when present.
 */
export interface RawZenhubWorkspace {
  id: string
  displayName: string
  name?: string | null
  description?: string | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawZenhubWorkspace): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.displayName,
    platform: 'zenhub',
    metadata: strMap({ name: raw.name, description: raw.description }),
    raw,
  }
}
