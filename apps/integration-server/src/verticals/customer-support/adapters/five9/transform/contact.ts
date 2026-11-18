/**
 * Transform a Five9 SCIM User into a canonical Contact.
 *
 * Five9 SCIM Users represent agents in the Five9 Virtual Contact Center.
 * We surface them as contacts to give integrations visibility into who
 * is interacting with the platform (e.g. external users imported via SCIM).
 *
 * Five9 SCIM User shape (RFC 7643):
 *   id            — opaque string identifier
 *   userName      — usually the user's email address
 *   name.formatted           — display name
 *   name.givenName / familyName
 *   emails[].value / primary — email addresses
 *   phoneNumbers[].value     — phone numbers
 *   externalId    — customer-controlled external identifier
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

interface ScimName {
  formatted?: string
  givenName?: string
  familyName?: string
  [key: string]: unknown
}

interface ScimEmail {
  value?: string
  primary?: boolean
  type?: string
  [key: string]: unknown
}

interface ScimPhone {
  value?: string
  primary?: boolean
  type?: string
  [key: string]: unknown
}

export interface RawFive9ScimUser {
  id?: string
  externalId?: string | null
  userName?: string
  name?: ScimName
  emails?: ScimEmail[]
  phoneNumbers?: ScimPhone[]
  active?: boolean
  [key: string]: unknown
}

function pickEmail(raw: RawFive9ScimUser): string | undefined {
  const emails = raw.emails ?? []
  const primary = emails.find((e) => e.primary)
  const first = emails[0]
  const val = pickStr(primary?.value) ?? pickStr(first?.value) ?? pickStr(raw.userName)
  return val
}

function pickPhone(raw: RawFive9ScimUser): string | undefined {
  const phones = raw.phoneNumbers ?? []
  const primary = phones.find((p) => p.primary)
  const first = phones[0]
  return pickStr(primary?.value) ?? pickStr(first?.value)
}

function pickName(raw: RawFive9ScimUser): string {
  if (raw.name?.formatted) return raw.name.formatted
  const parts = [raw.name?.givenName, raw.name?.familyName].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return pickStr(raw.userName) ?? ''
}

export function transformContact(raw: RawFive9ScimUser): Contact {
  const id = pickStr(raw.id) ?? pickStr(raw.externalId) ?? pickStr(raw.userName) ?? ''
  return {
    id,
    externalId: pickStr(raw.externalId) ?? id,
    email: pickEmail(raw),
    name: pickName(raw),
    phone: pickPhone(raw),
    organizationId: undefined,
    platform: 'five9',
    metadata: strMap({ userName: raw.userName, active: raw.active }),
    raw,
  }
}
