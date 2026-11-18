/**
 * Transform a Freshchat user (end-user / contact) into the canonical Contact schema.
 *
 * Freshchat users are the customers who initiate conversations.
 * They have first_name + last_name, email, phone, and optional properties array.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFreshchatUser {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
  org_contact_id?: string | null
  reference_id?: string | null
  restore_id?: string | null
  login_status?: boolean
  created_time?: string
  updated_time?: string
  properties?: Array<{ name?: string; value?: unknown }>
  [key: string]: unknown
}

function fullName(raw: RawFreshchatUser): string {
  const parts = [raw.first_name, raw.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : ''
}

export function transformContact(raw: RawFreshchatUser): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName(raw),
    phone: pickStr(raw.phone),
    organizationId: undefined,
    platform: 'freshchat',
    metadata: strMap({
      referenceId: raw.reference_id,
      orgContactId: raw.org_contact_id,
      createdTime: toIso(raw.created_time),
    }),
    raw,
  }
}
