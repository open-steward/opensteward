/**
 * Plain user → canonical User transform.
 *
 * Docs: https://www.plain.com/docs/graphql/introduction
 *
 * Confirmed schema (https://core-api.uk.plain.com/graphql/v1/schema.graphql):
 *   type User { id, fullName, publicName, email, roles: [Role!]!, status, isDeleted,
 *               createdAt: DateTime!, updatedAt: DateTime! }
 *   type Role { id, name, key }
 *   type DateTime { iso8601: String! }
 *   query users(filters, first, after): UserConnection!
 *   query user(userId: ID!): User
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPlainRole {
  id?: string | null
  name?: string | null
  key?: string | null
  [key: string]: unknown
}

export interface RawPlainUser {
  id: string
  fullName?: string | null
  publicName?: string | null
  email?: string | null
  roles?: RawPlainRole[] | null
  /** e.g. ACTIVE | DELETED */
  status?: string | null
  isDeleted?: boolean | null
  createdAt?: { iso8601?: string | null } | null
  updatedAt?: { iso8601?: string | null } | null
  [key: string]: unknown
}

export function transformUser(raw: RawPlainUser): User {
  const roles = raw.roles ?? []
  const roleNames = roles.map((r) => pickStr(r.name) ?? '').filter(Boolean)
  const primaryRole = roles[0]

  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.fullName) ?? pickStr(raw.publicName) ?? '',
    role: roleNames.length > 0 ? roleNames.join(', ') : undefined,
    teamIds: [],
    platform: 'plain',
    metadata: strMap({
      publicName: raw.publicName,
      primaryRole: primaryRole?.name,
      status: raw.status,
      isDeleted: raw.isDeleted,
      createdAt: raw.createdAt?.iso8601,
      updatedAt: toIso(raw.updatedAt?.iso8601),
    }),
    raw,
  }
}
