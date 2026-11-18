/**
 * Transform a Genesys Cloud platform user (agent) to the canonical User schema.
 *
 * GET /api/v2/users  — returns UserEntityListing with entities[]
 * GET /api/v2/users/{userId}  — single user
 *
 * Key fields: id, name, email, username, title, department, primaryContactInfo,
 *   division.id, state (active | deleted), images, manager.id, acdAutoAnswer.
 *
 * Queue membership is fetched separately; we omit it here to avoid N+1 calls.
 *
 * Docs: https://developer.genesys.cloud/useragentman/users/
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGenesysUser {
  id?: string
  name?: string
  email?: string
  username?: string
  title?: string
  department?: string
  /** State: active | deleted | inactive */
  state?: string
  division?: { id?: string; name?: string } | null
  manager?: { id?: string } | null
  primaryContactInfo?: Array<{ mediaType?: string; address?: string }> | null
  [key: string]: unknown
}

function findPhone(info: RawGenesysUser['primaryContactInfo']): string | undefined {
  if (!info) return undefined
  const phoneEntry = info.find(
    (c) => c.mediaType === 'PHONE' || c.mediaType === 'SMS',
  )
  return pickStr(phoneEntry?.address)
}

export function transformUser(raw: RawGenesysUser): User {
  const id = pickStr(raw.id) ?? ''
  const email = pickStr(raw.email)

  return {
    id,
    externalId: id,
    email,
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.title ?? raw.state),
    teamIds: [],  // Queue membership requires a separate API call
    platform: 'genesys-cloud',
    metadata: strMap({
      username: raw.username,
      department: raw.department,
      title: raw.title,
      state: raw.state,
      divisionId: raw.division?.id,
      phone: findPhone(raw.primaryContactInfo),
    }),
    raw,
  }
}
