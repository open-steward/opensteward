/**
 * SnapEngage agent (from Provisioning API) → canonical User.
 *
 * The SnapEngage Provisioning API returns agent objects with email,
 * name, phone, and accountType fields.  The email is the stable
 * identifier.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSnapengageAgent {
  /** Agent email — used as the stable identifier */
  email?: string
  name?: string
  phone?: string
  accountType?: string
  [key: string]: unknown
}

export function transformUser(raw: RawSnapengageAgent): User {
  const email = pickStr(raw.email) ?? ''
  return {
    id: email,
    externalId: email,
    email: email || undefined,
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.accountType),
    teamIds: [],
    platform: 'snapengage',
    metadata: strMap({ phone: raw.phone }),
    raw,
  }
}
