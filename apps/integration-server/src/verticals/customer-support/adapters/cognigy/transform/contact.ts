/**
 * Transform a Cognigy Live Agent (Chatwoot) contact into the canonical
 * Contact schema.
 *
 * Wire shape: contact object from
 *   GET /api/v1/accounts/{account_id}/contacts
 *   GET /api/v1/accounts/{account_id}/contacts/{id}
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCognigyContact {
  id: number
  name?: string
  email?: string | null
  phone_number?: string | null
  identifier?: string | null
  blocked?: boolean
  availability_status?: string
  thumbnail?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawCognigyContact): Contact {
  return {
    id: String(raw.id),
    externalId: raw.identifier ? String(raw.identifier) : String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone_number),
    platform: 'cognigy',
    metadata: strMap({
      availabilityStatus: raw.availability_status,
      blocked: raw.blocked,
    }),
    raw,
  }
}
