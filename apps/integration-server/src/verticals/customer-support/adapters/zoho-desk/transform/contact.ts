/**
 * Zoho Desk contact → canonical Contact.
 *
 * Fields from GET /api/v1/contacts and GET /api/v1/contacts/{contact_id}
 * (https://desk.zoho.com/DeskAPIDocument, Contacts): `firstName`, `lastName`
 * (the only required name on create), `email`, `phone`, `mobile`, `accountId`.
 * PII is limited to email, name and phone; `mobile` stands in only when
 * `phone` is empty.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZohoDeskContact {
  id: string | number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  accountId?: string | null
  [key: string]: unknown
}

/** An address the canonical `z.email()` accepts, or nothing. */
function email(v: unknown): string | undefined {
  const s = pickStr(v)?.trim()
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined
}

export function transformContact(raw: RawZohoDeskContact): Contact {
  const id = String(raw.id)
  const name = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ')
  return {
    id,
    externalId: id,
    email: email(raw.email),
    name: name || email(raw.email) || '',
    phone: pickStr(raw.phone) ?? pickStr(raw.mobile),
    organizationId: pickStr(raw.accountId),
    platform: 'zoho-desk',
    metadata: strMap({}),
    raw,
  }
}
