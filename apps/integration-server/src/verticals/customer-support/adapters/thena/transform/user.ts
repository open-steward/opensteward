import type { User } from '../../../schema'
import { UserSchema } from '../../../schema/user'
import { strMap, toIso } from './shared'

/**
 * One `hits[].document` from GET /v1/search/users (Users search,
 * https://docs.thena.ai/api-reference/search/users-search.md, "Core fields" and
 * "Default extended fields"; UserSearchResponseDto in
 * https://docs.thena.ai/api-reference/specs/platform-openapi.yaml, which marks
 * id, name, email, userType, status, isActive and timezone required).
 */
export interface RawThenaUser {
  /** "Unique user identifier" */
  id: string
  /** "Unique user UID" */
  uid?: string
  /** "User's full name" */
  name: string
  /** "User's email address" */
  email: string
  /** "User type (ORG_ADMIN, BOT_USER, etc.)" */
  userType: string
  /** "User status (ACTIVE, INACTIVE, etc.)" */
  status: string
  /** "Whether the user is active" */
  isActive: boolean
  /** "User's timezone" */
  timezone: string
  /** "Primary team ID (can be null)" */
  primaryTeamId?: string | null
  /** "Last login timestamp (ISO8601)" */
  lastLoginAt?: string
  avatarUrl?: string
  createdAt?: string
  updatedAt?: string
  /** "Array of teams the user belongs to"; each carries "id: Team identifier". */
  teams?: Array<{ id: string; name?: string }>
  [key: string]: unknown
}

export function transformUser(raw: RawThenaUser): User {
  const email = UserSchema.shape.email.safeParse(raw.email)
  return {
    id: raw.id,
    externalId: raw.id,
    email: email.success ? email.data : undefined,
    name: raw.name,
    role: raw.userType,
    teamIds: (raw.teams ?? []).map((t) => t.id),
    platform: 'thena',
    metadata: strMap({
      uid: raw.uid,
      status: raw.status,
      isActive: raw.isActive,
      timezone: raw.timezone,
      primaryTeamId: raw.primaryTeamId,
      lastLoginAt: toIso(raw.lastLoginAt),
      createdAt: toIso(raw.createdAt),
      updatedAt: toIso(raw.updatedAt),
    }),
    raw,
  }
}
