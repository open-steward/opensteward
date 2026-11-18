/**
 * Deskpro person (contact) transform.
 *
 * Endpoint: GET /api/v2/people
 * Response envelope: { data: [...] }
 *
 * Deskpro stores email addresses as a list (primary_email is the canonical
 * one). Organization is a linked object with an id.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Deskpro person object as returned inside response.data for
 * GET /api/v2/people and GET /api/v2/people/{id}.
 */
export interface RawDeskproPerson {
  id: number
  name?: string
  /** Primary email address */
  primary_email?: { email?: string } | string | null
  /** Phone number (first in list, if available) */
  phone_numbers?: Array<{ phone?: string }>
  /** Organization (company) linked object */
  organization?: { id?: number } | number | null
  [key: string]: unknown
}

function extractEmail(primary: RawDeskproPerson['primary_email']): string | undefined {
  if (primary == null) return undefined
  if (typeof primary === 'string') return primary || undefined
  return pickStr((primary as { email?: string }).email)
}

function extractPhone(phones: RawDeskproPerson['phone_numbers']): string | undefined {
  if (!Array.isArray(phones) || phones.length === 0) return undefined
  return pickStr(phones[0]?.phone)
}

function extractOrgId(org: RawDeskproPerson['organization']): string | undefined {
  if (org == null) return undefined
  if (typeof org === 'number') return org > 0 ? String(org) : undefined
  const id = (org as { id?: number }).id
  return id != null && id > 0 ? String(id) : undefined
}

export function transformContact(raw: RawDeskproPerson): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: extractEmail(raw.primary_email),
    name: pickStr(raw.name) ?? '',
    phone: extractPhone(raw.phone_numbers),
    organizationId: extractOrgId(raw.organization),
    platform: 'deskpro',
    metadata: strMap({}),
    raw,
  }
}
