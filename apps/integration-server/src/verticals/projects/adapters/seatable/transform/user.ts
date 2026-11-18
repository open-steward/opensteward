/**
 * SeaTable collaborator → canonical User.
 *
 * Endpoint: GET /api-gateway/api/v2/dtables/{base_uuid}/related-users/
 *
 * Returns a `user_list` array. Each entry:
 *   email       — unique login identifier (used as canonical ID)
 *   name        — display name
 *   avatar_url  — profile image (optional)
 *   contact_email — alternate email (optional)
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSeatableUser {
  email?: string
  name?: string
  avatar_url?: string
  contact_email?: string
  [key: string]: unknown
}

export function transformUser(raw: RawSeatableUser, workspaceId?: string): User {
  const id = pickStr(raw.email) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? id,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'seatable',
    metadata: strMap({
      avatarUrl: raw.avatar_url,
      contactEmail: raw.contact_email,
    }),
    raw,
  }
}
