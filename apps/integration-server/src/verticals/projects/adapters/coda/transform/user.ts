import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A canonical User maps to a Coda **workspace member** (`/workspaces/{id}/users`)
 * or the active token's identity (`/whoami`). Coda identifies people by their
 * login email rather than an opaque id, so `email` doubles as the canonical id.
 *
 * Workspace members expose `email` / `name` / `role`; `whoami` exposes
 * `loginId` (the email) / `name` / `tokenName`. This raw shape covers both.
 */
export interface RawCodaUser {
  /** Workspace-member email / whoami loginId — both are the login email. */
  email?: string
  loginId?: string
  name?: string
  type?: 'user'
  role?: string
  pictureUrl?: string
  pictureLink?: string
  registeredAt?: string
  tokenName?: string
  scoped?: boolean
  workspace?: { id: string; name?: string }
  [key: string]: unknown
}

export function transformUser(raw: RawCodaUser, workspaceId?: string): User {
  const email = pickStr(raw.email ?? raw.loginId)
  const id = email ?? ''
  const workspaceIds = workspaceId
    ? [workspaceId]
    : raw.workspace?.id
      ? [raw.workspace.id]
      : []
  return {
    id,
    externalId: id,
    email,
    name: pickStr(raw.name) ?? '',
    workspaceIds,
    platform: 'coda',
    metadata: strMap({
      role: raw.role,
      tokenName: raw.tokenName,
      scoped: raw.scoped,
      registeredAt: toIso(raw.registeredAt),
      workspaceName: raw.workspace?.name,
    }),
    raw,
  }
}
