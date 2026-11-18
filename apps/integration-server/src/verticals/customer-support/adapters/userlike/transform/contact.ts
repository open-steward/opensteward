/**
 * Transform a Userlike contact_identity object into the canonical Contact shape.
 *
 * Schema-firewall: city/country/street/gender/salutation kept in metadata only;
 * contact PII surface = email + name + phone.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUserlikeContact {
  id: number
  name?: string | null
  email?: string | null
  phone_number?: string | null
  mobile_number?: string | null
  city?: string | null
  country?: string | null
  locale?: string | null
  verified?: boolean
  external_customer_id?: string | null
  conversation_count?: number
  [key: string]: unknown
}

export function transformContact(raw: RawUserlikeContact): Contact {
  return {
    id: String(raw.id),
    externalId: raw.external_customer_id ? pickStr(raw.external_customer_id) ?? String(raw.id) : String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone_number) ?? pickStr(raw.mobile_number),
    platform: 'userlike',
    metadata: strMap({
      city: raw.city,
      country: raw.country,
      locale: raw.locale,
      verified: raw.verified,
      conversation_count: raw.conversation_count,
    }),
    raw,
  }
}
