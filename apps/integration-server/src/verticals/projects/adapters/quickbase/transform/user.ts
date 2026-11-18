import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Quickbase user from the REST v1 POST /v1/users (getUsers) endpoint.
 *
 * The endpoint returns account-scoped users and is paginated via
 * `nextPageToken`. Each user object carries an `id`, `name`, `email`, and
 * optional `firstName` / `lastName` consistent with the legacy API shape.
 *
 * Docs: https://developer.quickbase.com/operation/getUsers
 */
export interface RawQuickbaseUser {
  id?: string
  name?: string
  firstName?: string
  lastName?: string
  email?: string
  screenName?: string
  [key: string]: unknown
}

export function transformUser(raw: RawQuickbaseUser, appId?: string): User {
  const id = pickStr(raw.id) ?? ''
  const composed = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ')
  const fullName =
    pickStr(raw.name) ??
    (composed.length > 0 ? composed : undefined) ??
    pickStr(raw.screenName) ??
    ''

  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: fullName,
    workspaceIds: appId ? [appId] : [],
    platform: 'quickbase',
    metadata: strMap({
      screenName: raw.screenName,
      firstName: raw.firstName,
      lastName: raw.lastName,
    }),
    raw,
  }
}
