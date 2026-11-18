/**
 * WATI contact transform.
 *
 * Maps WATI v3 contact object to the canonical Contact schema.
 * WATI contacts represent WhatsApp end-users identified by phone number (wa_id).
 *
 * Docs: https://docs.wati.io/reference/get_api-ext-v3-contacts
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Shape returned by GET /api/ext/v3/contacts and /contacts/{target}. */
export interface RawWatiContact {
  id?: string
  wa_id?: string
  name?: string
  phone?: string
  photo?: string | null
  created?: string | number | null
  last_updated?: string | number | null
  contact_status?: string | null
  source?: string | null
  channel_id?: string | null
  opted_in?: boolean | null
  allow_broadcast?: boolean | null
  custom_params?: Array<{ name?: string; value?: string }> | null
  [key: string]: unknown
}

export function transformContact(raw: RawWatiContact): Contact {
  // WATI uses wa_id (WhatsApp ID = phone number without +) as the primary identifier
  const id = pickStr(raw.id) ?? pickStr(raw.wa_id) ?? ''
  return {
    id,
    externalId: id,
    // WATI does not store email — contacts are WhatsApp-only
    email: undefined,
    name: pickStr(raw.name) ?? '',
    // phone field is the full phone number string; wa_id is also the phone number
    phone: pickStr(raw.phone) ?? pickStr(raw.wa_id),
    organizationId: undefined,
    platform: 'wati',
    metadata: strMap({
      contactStatus: raw.contact_status,
      source: raw.source,
      channelId: raw.channel_id,
      optedIn: raw.opted_in,
      allowBroadcast: raw.allow_broadcast,
      created: raw.created != null ? toIso(raw.created) : undefined,
      lastUpdated: raw.last_updated != null ? toIso(raw.last_updated) : undefined,
    }),
    raw,
  }
}
