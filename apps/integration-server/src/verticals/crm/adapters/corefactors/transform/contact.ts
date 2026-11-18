/**
 * Contact transforms for the Corefactors (Teleduce) CRM adapter.
 *
 * Corefactors stores contacts as "leads". Field names on the wire use
 * camelCase or PascalCase depending on which sub-API is called.
 *
 * Lead-API response fields (documented):
 *   id            — unique lead identifier
 *   first_name    — given name
 *   last_name     — family name
 *   email         — primary email
 *   mobile_number — primary mobile / phone
 *   city          — city (part of address)
 *   lead_type     — lead category / source
 *   owner         — assigned owner identifier
 *   created_at    — ISO-like creation timestamp
 *   updated_at    — ISO-like last-modified timestamp
 */

import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCorefactorsContact {
  id?: string | number
  first_name?: string
  last_name?: string
  email?: string
  mobile_number?: string
  city?: string
  lead_type?: string
  owner?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawCorefactorsContact): Contact {
  const nameParts = [raw.first_name, raw.last_name].filter(Boolean)
  return {
    id: String(raw.id ?? ''),
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: raw.email ?? undefined,
    phone: raw.mobile_number ?? undefined,
    stage: raw.lead_type ?? undefined,
    owner_id: raw.owner !== undefined ? String(raw.owner) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.mobile_number = data.phone
  if (data.stage !== undefined) out.lead_type = data.stage
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
