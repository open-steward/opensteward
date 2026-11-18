/**
 * Missive contact → Contact
 *
 * Missive contacts are fetched from GET /v1/contacts (requires contact_book param).
 * The contact object has first_name, last_name, infos (email/phone array), and memberships.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawMissiveContactInfo {
  /** 'email' | 'phone' | 'url' | etc. */
  type?: string | null
  value?: string | null
  [key: string]: unknown
}

export interface RawMissiveMembership {
  id?: string
  contact_group?: { id?: string; name?: string; [key: string]: unknown } | null
  [key: string]: unknown
}

export interface RawMissiveContact {
  id: string
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  starred?: boolean
  deleted?: boolean
  /** ISO-8601 string */
  modified_at?: string | null
  contact_book?: { id?: string; name?: string; [key: string]: unknown } | null
  infos?: RawMissiveContactInfo[]
  memberships?: RawMissiveMembership[]
  [key: string]: unknown
}

function extractEmail(infos: RawMissiveContactInfo[] | undefined): string | undefined {
  const info = (infos ?? []).find((i) => i.type === 'email' && i.value)
  return info ? pickStr(info.value) : undefined
}

function extractPhone(infos: RawMissiveContactInfo[] | undefined): string | undefined {
  const info = (infos ?? []).find((i) => i.type === 'phone' && i.value)
  return info ? pickStr(info.value) : undefined
}

function buildName(raw: RawMissiveContact): string {
  const parts = [raw.first_name, raw.middle_name, raw.last_name].filter(Boolean)
  return parts.join(' ') || ''
}

export function transformContact(raw: RawMissiveContact): Contact {
  const name = buildName(raw)
  const email = extractEmail(raw.infos)
  const phone = extractPhone(raw.infos)
  const contactBookId = raw.contact_book?.id ? String(raw.contact_book.id) : undefined

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email,
    name,
    phone,
    organizationId: contactBookId,
    platform: 'missive',
    metadata: strMap({
      starred: raw.starred,
      deleted: raw.deleted,
      modifiedAt: toIso(raw.modified_at),
    }),
    raw,
  }
}
