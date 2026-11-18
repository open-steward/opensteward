/**
 * Transform eDesk contact raw API response to the canonical Contact schema.
 *
 * eDesk contact fields (v1):
 *   id, channel_id, client_id, full_name, phone_number, email
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawEdeskContact {
  id: number | string
  channel_id?: number | null
  client_id?: string | null
  full_name?: string | null
  phone_number?: string | null
  email?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawEdeskContact): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.full_name) ?? '',
    phone: pickStr(raw.phone_number),
    platform: 'edesk',
    metadata: strMap({
      channelId: raw.channel_id,
      clientId: raw.client_id,
    }),
    raw,
  }
}
