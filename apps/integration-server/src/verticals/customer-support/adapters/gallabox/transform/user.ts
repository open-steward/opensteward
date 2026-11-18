/**
 * Transform a raw Gallabox user (agent) into the canonical User shape.
 *
 * Response example from GET /accounts/:accountId/users:
 * [{
 *   "name": "sb2751",
 *   "email": "sb2751@mailinator.com",
 *   "accounts": [{
 *     "accountId": "629e06e58e13b5000ae338d5",
 *     "roleId": "60925e84f8fd0d000439dc9e",
 *     "availability": "Available",
 *     "teamIds": [],
 *     "channelIds": ["629e0b6c3d6ad600044197a0"],
 *     "createdAt": "2024-05-27T10:01:15.687Z",
 *     "updatedAt": "2024-05-27T10:01:15.687Z"
 *   }],
 *   "id": "665459eb46c268e1e4674f4e",
 *   "exists": true
 * }]
 *
 * Docs: https://developers.gallabox.com/gallabox-api/users
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

interface RawGallaboxAccountEntry {
  accountId?: string
  roleId?: string
  availability?: string
  teamIds?: string[]
  channelIds?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface RawGallaboxUser {
  id?: string
  _id?: string
  name?: string
  email?: string
  exists?: boolean
  accounts?: RawGallaboxAccountEntry[]
  [key: string]: unknown
}

export function transformUser(raw: RawGallaboxUser, targetAccountId?: string): User {
  const id = String(raw.id ?? raw._id ?? '')

  // Pick the account entry matching the tenant account (or the first one)
  const accountEntry = targetAccountId
    ? (raw.accounts ?? []).find((a) => a.accountId === targetAccountId)
    : (raw.accounts ?? [])[0]

  const teamIds = accountEntry?.teamIds?.filter(Boolean).map(String) ?? []
  const roleId = accountEntry?.roleId ?? undefined

  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: roleId ? pickStr(roleId) : undefined,
    teamIds,
    platform: 'gallabox',
    metadata: strMap({
      availability: accountEntry?.availability,
      roleId: accountEntry?.roleId,
    }),
    raw,
  }
}
