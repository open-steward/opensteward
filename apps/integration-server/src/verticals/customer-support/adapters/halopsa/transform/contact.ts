/**
 * Transform a raw HaloPSA Customer (end-user / requester) to the canonical
 * Contact shape.
 *
 * HaloPSA wire fields for Customer/User objects:
 *   id          — integer customer ID
 *   name        — full name
 *   firstname   — given name
 *   surname     — family name
 *   emailaddress — primary email
 *   phone       — phone number
 *   mobile      — mobile phone
 *   site_id     — site / location ID (maps to organization)
 *   client_id   — parent client/company ID (maps to organization when present)
 *   inactive    — boolean (true = deactivated)
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHaloPsaCustomer {
  id: number
  name?: string | null
  firstname?: string | null
  surname?: string | null
  emailaddress?: string | null
  phone?: string | null
  mobile?: string | null
  site_id?: number | null
  client_id?: number | null
  inactive?: boolean | null
  [key: string]: unknown
}

function resolveName(raw: RawHaloPsaCustomer): string {
  if (pickStr(raw.name)) return String(raw.name)
  const first = pickStr(raw.firstname) ?? ''
  const last = pickStr(raw.surname) ?? ''
  const full = `${first} ${last}`.trim()
  return full || ''
}

export function transformContact(raw: RawHaloPsaCustomer): Contact {
  const orgId = raw.client_id != null ? String(raw.client_id) : (raw.site_id != null ? String(raw.site_id) : undefined)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.emailaddress),
    name: resolveName(raw),
    phone: pickStr(raw.phone) ?? pickStr(raw.mobile),
    organizationId: orgId,
    platform: 'halopsa',
    metadata: strMap({ inactive: raw.inactive }),
    raw,
  }
}
