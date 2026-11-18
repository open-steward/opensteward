/**
 * Help Scout user → canonical User.
 *
 * Fields from the Get User response docs:
 * https://developer.helpscout.com/mailbox-api/endpoints/users/get/
 */
import { z } from 'zod'
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'
import { fullName } from './contact'

export interface RawHelpScoutUser {
  id: number
  firstName?: string
  lastName?: string
  email?: string
  /** "owner admin user light user" */
  role?: string
  /** "User type - team or user" */
  type?: string
  timezone?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const Email = z.email()

export function transformUser(raw: RawHelpScoutUser): User {
  const email = typeof raw.email === 'string' ? raw.email.trim() : ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: email && Email.safeParse(email).success ? email : undefined,
    name: fullName(raw.firstName, raw.lastName),
    role: pickStr(raw.role),
    // The user resource names no teams; team membership is its own endpoint.
    teamIds: [],
    platform: 'helpscout',
    metadata: strMap({
      type: raw.type,
      timezone: raw.timezone,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }),
    raw,
  }
}
