import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * ZenHub user, from `Workspace.zenhubUsers` and `node(id) { ... on ZenhubUser }`
 * in the public GraphQL schema
 * (https://developers.zenhub.com/schema/zenhub-public-api.graphql):
 *
 *   type ZenhubUser implements Node & Timestamps {
 *     id: ID!  name: String  email: String  githubUser: User ...
 *   }
 *   type User { login: String! ... }   (the linked GitHub user)
 *
 * ZenhubUser has no `login`; the GitHub login lives on `githubUser` and goes
 * to metadata. `name` is nullable in the schema: a user without one maps to
 * an empty name rather than borrowing another field.
 */
export interface RawZenhubUser {
  id: string
  name?: string | null
  email?: string | null
  githubUser?: { login: string } | null
  [key: string]: unknown
}

export function transformUser(raw: RawZenhubUser, workspaceId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: raw.name ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'zenhub',
    metadata: strMap({ githubLogin: raw.githubUser?.login }),
    raw,
  }
}
