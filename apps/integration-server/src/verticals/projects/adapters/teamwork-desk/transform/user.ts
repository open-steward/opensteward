/**
 * Transform a raw Teamwork Spaces user object into the canonical User.
 *
 * Users are installation-scoped (not tied to a specific space), returned by:
 *   GET /spaces/api/v1/users.json
 *
 * User fields:
 *   id, firstname, lastname, email, avatar, state, userType,
 *   isAdmin, isOnboarded,
 *   createdAt, updatedAt, deletedAt,
 *   LinkedCompany, LinkedInstallation
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSpacesUser {
  id: number | string
  firstname?: string
  lastname?: string
  email?: string
  avatar?: string
  state?: string
  userType?: string
  isAdmin?: boolean
  isOnboarded?: boolean
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  [key: string]: unknown
}

function buildName(raw: RawSpacesUser): string {
  const first = pickStr(raw.firstname) ?? ''
  const last = pickStr(raw.lastname) ?? ''
  const full = [first, last].filter(Boolean).join(' ')
  return full || (pickStr(raw.email) ?? '')
}

export function transformUser(raw: RawSpacesUser): User {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: buildName(raw),
    // Spaces users are installation-scoped — no per-workspace membership list.
    workspaceIds: [],
    platform: 'teamwork-desk',
    metadata: strMap({
      state: raw.state,
      userType: raw.userType,
      isAdmin: raw.isAdmin,
      avatar: raw.avatar,
    }),
    raw,
  }
}
