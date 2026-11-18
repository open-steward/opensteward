/**
 * Transform a raw SuiteProjects Pro user record into the canonical User schema.
 *
 * OpenAir user fields used here:
 *   id          – integer (read-only), unique internal identifier
 *   email       – string, required, user's email address
 *   firstName   – string
 *   lastName    – string
 *   displayName – string (read-only), formatted as "<firstName> <lastName>"
 *   nickname    – string, required, unique username/login
 *   isActive    – Boolean, 1/0 active flag
 *   created     – string($date-time), system-generated
 *   updated     – string($date-time), system-generated
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSuiteProjectsUser {
  id?: number | string
  email?: string
  firstName?: string
  lastName?: string
  displayName?: string
  nickname?: string
  isActive?: boolean | number
  created?: string
  updated?: string
  [key: string]: unknown
}

function buildName(raw: RawSuiteProjectsUser): string {
  if (raw.displayName) return String(raw.displayName)
  const parts = [raw.firstName, raw.lastName].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  if (raw.nickname) return String(raw.nickname)
  return ''
}

export function transformUser(raw: RawSuiteProjectsUser): User {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: buildName(raw),
    // SuiteProjects Pro does not expose workspace/org memberships per user
    workspaceIds: [],
    platform: 'suiteprojects-pro',
    metadata: strMap({
      nickname: raw.nickname,
      isActive: raw.isActive,
    }),
    raw,
  }
}
