/**
 * Taiga workspace transform.
 *
 * Taiga does not have a first-class "workspace" concept. The closest
 * equivalent is the authenticated user's own profile — treating the user's
 * account as a single workspace that contains all their projects.
 *
 * GET /users/me returns the current user object which we surface as the
 * workspace. The id is the user id; the name is the user's full name or
 * username.
 *
 * Docs: https://docs.taiga.io/api.html#users-me
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTaigaMe {
  id: number
  username?: string
  full_name?: string
  full_name_display?: string
  email?: string
  bio?: string
  lang?: string
  timezone?: string
  is_active?: boolean
  [key: string]: unknown
}

export function transformWorkspace(raw: RawTaigaMe): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.full_name_display ?? raw.full_name ?? raw.username) ?? '',
    platform: 'taiga',
    metadata: strMap({
      username: raw.username,
      email: raw.email,
      lang: raw.lang,
      timezone: raw.timezone,
    }),
    raw,
  }
}
