import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * A Kantata OX User. Maps to the canonical `User`. Users are account-scoped;
 * there is no per-workspace membership returned on the base user object, so
 * `workspaceIds` is populated only from a caller-supplied scope.
 */
export interface RawKantataUser {
  id: string
  full_name?: string
  email_address?: string
  headline?: string
  photo_path?: string
  account_membership_id?: string
  [key: string]: unknown
}

export function transformUser(raw: RawKantataUser, workspaceId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email_address),
    name: pickStr(raw.full_name) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'kantata',
    metadata: strMap({
      headline: raw.headline,
      accountMembershipId: raw.account_membership_id,
    }),
    raw,
  }
}
