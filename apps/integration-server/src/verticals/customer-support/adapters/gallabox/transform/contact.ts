/**
 * Transform a raw Gallabox contact into the canonical Contact shape.
 *
 * Response example:
 * {
 *   "id": "63b6435579516389fa99f2c4",
 *   "accountId": "...",
 *   "name": "Yogesh",
 *   "email": ["yexex@example.com"],
 *   "phone": ["919840985909"],
 *   "tags": [{ "id": "...", "name": "..." }],
 *   "createdAt": "2023-01-05T03:26:13.929Z",
 *   "updatedAt": "...",
 *   "contactOwnerId": "...",
 *   "formattedPhone": [{ "countryCode": "91", "phoneNumber": "9840985909" }],
 *   "marketingOptIn": true
 * }
 *
 * Docs: https://developers.gallabox.com/gallabox-api/contacts
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGallaboxContact {
  id?: string
  _id?: string
  accountId?: string
  name?: string
  email?: string | string[]
  phone?: string | string[]
  tags?: Array<{ id?: string; _id?: string; name?: string } | string>
  contactOwnerId?: string | null
  formattedPhone?: Array<{ countryCode?: string; phoneNumber?: string }>
  marketingOptIn?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function firstStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0] ? String(v[0]) : undefined
  return pickStr(v)
}

export function transformContact(raw: RawGallaboxContact): Contact {
  const id = String(raw.id ?? raw._id ?? '')
  return {
    id,
    externalId: id,
    email: firstStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: firstStr(raw.phone),
    platform: 'gallabox',
    metadata: strMap({
      accountId: raw.accountId,
      contactOwnerId: raw.contactOwnerId,
      marketingOptIn: raw.marketingOptIn,
    }),
    raw,
  }
}
