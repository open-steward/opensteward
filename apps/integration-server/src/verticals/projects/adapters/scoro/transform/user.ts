/**
 * Transform a raw Scoro user into the canonical User schema.
 *
 * Scoro user key fields (API v2, module: "users"):
 *   id          – integer identifier
 *   username    – login username
 *   email       – primary email
 *   full_name   – display name (also firstname + lastname separately)
 *   status      – "active" | "inactive"
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawScoroUser {
  id?: number | string
  username?: string
  email?: string
  full_name?: string
  firstname?: string
  lastname?: string
  status?: string
  [key: string]: unknown
}

export function transformUser(raw: RawScoroUser, companyAccountId?: string): User {
  const id = String(raw.id ?? '')
  const joinedName = [raw.firstname, raw.lastname].filter(Boolean).join(' ').trim()
  const displayName =
    pickStr(raw.full_name) ?? (joinedName.length > 0 ? joinedName : null) ?? pickStr(raw.username) ?? ''

  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: displayName,
    workspaceIds: companyAccountId ? [companyAccountId] : [],
    platform: 'scoro',
    metadata: strMap({
      username: raw.username,
      status: raw.status,
    }),
    raw,
  }
}
