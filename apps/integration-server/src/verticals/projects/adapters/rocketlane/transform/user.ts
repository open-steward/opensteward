import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Shape returned by GET /users and GET /users/{userId}.
 *
 * Rocketlane users belong to the whole account (not a workspace), so
 * `workspaceIds` is always an empty array — callers pass `workspaceId` only
 * for interface compatibility.
 */
export interface RawRocketlaneUser {
  userId?: number | string
  firstName?: string
  lastName?: string
  email?: string
  type?: string             // e.g. "INTERNAL", "EXTERNAL"
  status?: string           // e.g. "ACTIVE", "INACTIVE"
  roleId?: number | string
  capacityInMinutes?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformUser(raw: RawRocketlaneUser): User {
  const id = String(raw.userId ?? '')
  const first = pickStr(raw.firstName) ?? ''
  const last = pickStr(raw.lastName) ?? ''
  const name = [first, last].filter(Boolean).join(' ')

  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name,
    workspaceIds: [],
    platform: 'rocketlane',
    metadata: strMap({
      type: raw.type,
      status: raw.status,
      roleId: raw.roleId,
      createdAt: raw.createdAt,
      updatedAt: toIso(raw.updatedAt),
    }),
    raw,
  }
}
