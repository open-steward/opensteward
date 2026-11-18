/**
 * Maps a Document360 team account to the canonical User (agent) shape.
 *
 * Team accounts are the staff/editors who manage the knowledge base.
 *
 * Source: https://apihub.document360.io/swagger/v2/swagger.json
 *   - `TeamAccountSummaryCustomer` ("Returned by `GET /v2/teams`"): user_id,
 *     first_name, last_name, email_id, profile_logo_url, portal_role (string,
 *     "The name of the portal role"), last_login_at.
 *   - `CompleteUserInfoCustomer` (`GET /v2/Teams/{userId}`, under `result`): the
 *     same identity fields, but `portal_role` is an object
 *     (`{ "role_id": "...", "role_name": " Owner" }` in the documented example).
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/** `TeamAccountSummaryCustomer`, one row of `GET /v2/Teams`. */
export interface RawDocument360TeamMember {
  user_id?: string | null
  first_name?: string | null
  last_name?: string | null
  email_id?: string | null
  profile_logo_url?: string | null
  /** "The name of the portal role" */
  portal_role?: string | null
  last_login_at?: string | null
  [key: string]: unknown
}

/** `CompleteUserInfoCustomer`, the `result` of `GET /v2/Teams/{userId}`. */
export interface RawDocument360TeamMemberDetail {
  user_id?: string | null
  first_name?: string | null
  last_name?: string | null
  email_id?: string | null
  profile_logo_url?: string | null
  last_login_at?: string | null
  portal_role?: { role_id?: string | null; role_name?: string | null } | null
  content_roles?: unknown[] | null
  associated_groups?: unknown[] | null
  [key: string]: unknown
}

interface Identity {
  user_id?: string | null
  first_name?: string | null
  last_name?: string | null
  email_id?: string | null
  profile_logo_url?: string | null
}

function buildUser(raw: Identity, role: string | undefined, source: unknown): User {
  const id = pickStr(raw.user_id)
  if (!id) throw new Error('document360 team account has no user_id')
  const name = [pickStr(raw.first_name), pickStr(raw.last_name)].filter(Boolean).join(' ')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email_id),
    name,
    role,
    teamIds: [],
    platform: 'document360',
    metadata: strMap({ profileLogoUrl: raw.profile_logo_url }),
    raw: source,
  }
}

export function transformUser(raw: RawDocument360TeamMember): User {
  return buildUser(raw, pickStr(raw.portal_role), raw)
}

export function transformUserDetail(raw: RawDocument360TeamMemberDetail): User {
  return buildUser(raw, pickStr(raw.portal_role?.role_name), raw)
}
