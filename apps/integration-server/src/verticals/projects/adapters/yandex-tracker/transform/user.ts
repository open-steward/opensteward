import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Yandex Tracker user object from GET /v3/users.
 * Docs: https://yandex.ru/support/tracker/ru/get-users
 */
export interface RawYandexTrackerUser {
  uid?: number | string
  login?: string
  trackerUid?: number | string
  passportUid?: number | string
  cloudUid?: string
  firstName?: string
  lastName?: string
  display?: string
  email?: string
  external?: boolean
  hasLicense?: boolean
  dismissed?: boolean
  [key: string]: unknown
}

export function transformUser(raw: RawYandexTrackerUser, workspaceId?: string): User {
  const id = raw.cloudUid ?? (raw.uid ? String(raw.uid) : raw.login ?? '')
  const firstName = pickStr(raw.firstName) ?? ''
  const lastName = pickStr(raw.lastName) ?? ''
  const displayName =
    pickStr(raw.display) ??
    (firstName || lastName ? `${firstName} ${lastName}`.trim() : pickStr(raw.login) ?? '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: displayName,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'yandex-tracker',
    metadata: strMap({
      login: raw.login,
      dismissed: raw.dismissed,
      hasLicense: raw.hasLicense,
    }),
    raw,
  }
}
