/**
 * Transforms Zoho Sprints workspace users into the canonical User schema.
 *
 * "Get workspace users" (GET /team/{teamId}/users/, https://sprints.zoho.com/apidoc.html)
 * returns users as positional arrays, documented example:
 *   {"userJObj":{"2000000007241":["J**n M***h","j***m@z****r.com",true,…]},
 *    "next":false,"userIds":["2000000000005","2000000007241"],
 *    "user_prop":{"iamUserId":3,"userStatus":4,"displayName":0,"roleId":6,
 *                 "emailId":1,…,"profileId":7,…,"userType":11,…},"status":"success"}
 *
 * `userIds` orders the page, `userJObj[id]` is the row, and `user_prop` names
 * each position. Positions are read from `user_prop`, never assumed.
 */
import { z } from 'zod'
import type { User } from '../../../schema'
import { pickStr } from './shared'

export interface ZohoSprintsUsersPage {
  userIds?: string[]
  userJObj?: Record<string, readonly unknown[]>
  user_prop?: Record<string, number>
  next?: boolean
  status?: string
}

/** Documented `user_prop` keys carried into metadata. */
const METADATA_PROPS = ['roleId', 'profileId', 'userStatus', 'userType'] as const

const Email = z.email()

function at(row: readonly unknown[], prop: Record<string, number>, key: string): unknown {
  const i = prop[key]
  return typeof i === 'number' ? row[i] : undefined
}

export function transformUser(
  userId: string,
  row: readonly unknown[],
  prop: Record<string, number>,
  workspaceId: string,
): User {
  const name = at(row, prop, 'displayName')
  if (typeof name !== 'string') {
    throw new Error(`Zoho Sprints user ${userId} has no displayName in userJObj`)
  }
  const email = at(row, prop, 'emailId')
  const metadata: Record<string, string> = {}
  for (const key of METADATA_PROPS) {
    const v = at(row, prop, key)
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      metadata[key] = String(v)
    }
  }
  return {
    id: userId,
    externalId: userId,
    email: typeof email === 'string' && Email.safeParse(email).success ? email : undefined,
    name,
    workspaceIds: [workspaceId],
    platform: 'zoho-sprints',
    metadata,
    raw: { userId, row: [...row], user_prop: prop },
  }
}

/** Every user on one documented response page, in `userIds` order. */
export function transformUsersPage(res: ZohoSprintsUsersPage, workspaceId: string): User[] {
  const prop = res.user_prop ?? {}
  const rows = res.userJObj ?? {}
  return (res.userIds ?? []).map((id) => {
    const userId = pickStr(id)
    const row = userId === undefined ? undefined : rows[userId]
    if (userId === undefined || !Array.isArray(row)) {
      throw new Error(`Zoho Sprints userIds entry ${String(id)} has no userJObj row`)
    }
    return transformUser(userId, row, prop, workspaceId)
  })
}
