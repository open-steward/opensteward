/**
 * Fibery user transform.
 *
 * Fibery users are queried via `q/from: "fibery/user"` with fields:
 *   fibery/id      — UUID
 *   user/name      — full display name
 *   user/email     — email address
 *
 * All users in an account belong to the single workspace.
 *
 * Docs: https://developers.fibery.com/guides/http-api/query-entities
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFiberyUser {
  /** UUID of the user entity. */
  'fibery/id': string
  /** Display name. */
  'user/name'?: string
  /** Email address. */
  'user/email'?: string
  /** Injected by the adapter: the workspace UUID. */
  workspaceId?: string
  [key: string]: unknown
}

export function transformUser(raw: RawFiberyUser, workspaceId?: string): User {
  const id = raw['fibery/id'] ?? ''
  const wsId = workspaceId ?? pickStr(raw['workspaceId'])
  return {
    id,
    externalId: id,
    email: pickStr(raw['user/email']),
    name: pickStr(raw['user/name']) ?? '',
    workspaceIds: wsId ? [wsId] : [],
    platform: 'fibery',
    metadata: strMap({}),
    raw,
  }
}
