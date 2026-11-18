/**
 * Freshservice requester (contact) transform.
 *
 * Freshservice calls end-users "requesters". Key fields:
 *   id, first_name, last_name, primary_email, phone, mobile_phone,
 *   department_id, external_id, created_at, updated_at.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreshserviceRequester {
  id: number
  first_name?: string
  last_name?: string | null
  /** Primary email of the requester */
  primary_email?: string
  phone?: string | null
  mobile_phone?: string | null
  department_id?: number | null
  external_id?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawFreshserviceRequester): Contact {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name)
  const name = lastName ? `${firstName} ${lastName}`.trim() : firstName
  return {
    id: String(raw.id),
    externalId: String(raw.external_id ?? raw.id),
    email: pickStr(raw.primary_email),
    name,
    phone: pickStr(raw.phone) ?? pickStr(raw.mobile_phone),
    organizationId: raw.department_id ? String(raw.department_id) : undefined,
    platform: 'freshservice',
    metadata: strMap({}),
    raw,
  }
}
