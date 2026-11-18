/**
 * InvGate Service Management — user (contact/requester) transform.
 *
 * User fields from /user and /users endpoints:
 *   id, name, email, username, phone (not always present)
 *
 * In InvGate, end-users (requesters) and agents share the /user endpoint;
 * contacts are end-users (role != 'agent' / 'admin').
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawInvGateUser {
  id: number
  name?: string | null
  email?: string | null
  username?: string | null
  phone?: string | null
  company_id?: number | null
  role?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawInvGateUser): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? pickStr(raw.username) ?? '',
    phone: pickStr(raw.phone),
    organizationId: raw.company_id != null ? String(raw.company_id) : undefined,
    platform: 'helpcrunch-na',
    metadata: strMap({ username: raw.username }),
    raw,
  }
}
