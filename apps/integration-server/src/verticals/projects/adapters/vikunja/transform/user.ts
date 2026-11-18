import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Vikunja User object returned by GET /projects/{id}/projectusers and
 * embedded in tasks, comments, and webhooks.
 *
 * Fields sourced from pkg/user/user.go:
 *   id, name, username, email (omitempty), created, updated.
 *
 * Vikunja has no workspace concept, so workspaceIds is set from the caller's
 * context (the project id being queried) when available.
 */
export interface RawVikunjaUser {
  id: number
  name?: string
  username?: string
  email?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformUser(raw: RawVikunjaUser, workspaceId?: string): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? pickStr(raw.username) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'vikunja',
    metadata: strMap({
      username: raw.username,
    }),
    raw,
  }
}
