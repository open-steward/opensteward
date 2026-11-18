import { z } from 'zod'
import type { User } from '../../../schema'
import { strMap } from './shared'

/**
 * Birdview PSA `UserModelWithSkills` (GET /api/v2/users → `UsersResponse.Items`,
 * GET /api/v2/users/{id}), per
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json:
 *   allOf(UserModel {UserId, Login, Name, EMail, Enabled, CanLogin, ...}, {Skills})
 * Only the fields read below are typed; rates, roles and skills stay in `raw`.
 */
export interface RawBirdviewUser {
  UserId: number
  Name: string
  EMail?: string
  Enabled?: boolean
  CanLogin?: boolean
  [key: string]: unknown
}

const Email = z.email()

export function transformUser(raw: RawBirdviewUser): User {
  if (raw.UserId == null) throw new Error('Birdview PSA user has no UserId')
  const id = String(raw.UserId)
  const email = Email.safeParse(raw.EMail)
  return {
    id,
    externalId: id,
    email: email.success ? email.data : undefined,
    name: raw.Name,
    // Users are account-wide in Birdview; no workspace resource is served.
    workspaceIds: [],
    platform: 'birdview',
    metadata: strMap({ enabled: raw.Enabled, canLogin: raw.CanLogin }),
    raw,
  }
}
