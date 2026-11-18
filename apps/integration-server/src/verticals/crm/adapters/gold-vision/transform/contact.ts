/**
 * Gold-Vision ↔ canonical Contact transforms.
 *
 * Gold-Vision contact wire fields (from /api/cosmos/contacts metadata):
 *   id            — unique record identifier (numeric string)
 *   summary       — display name (full name)
 *   firstName     — given name
 *   lastName      — family name / surname
 *   email         — primary email address
 *   phone         — main phone number
 *   mobile        — mobile phone number
 *   jobTitle      — job title
 *   accountId     — parent Account id
 *   ownerId       — assigned user id
 *   createdDate   — ISO 8601 creation timestamp
 *   modifiedDate  — ISO 8601 last-modified timestamp
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface RawGoldVisionContact {
  id?: string | number
  summary?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobile?: string
  jobTitle?: string
  accountId?: string | number
  ownerId?: string | number
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawGoldVisionContact): Contact {
  const nameParts = [raw.firstName, raw.lastName].filter(Boolean)
  return {
    id: String(raw.id ?? ''),
    first_name: raw.firstName ?? undefined,
    last_name: raw.lastName ?? undefined,
    name:
      nameParts.length > 0
        ? nameParts.join(' ')
        : (raw.summary ?? undefined),
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobile ?? undefined,
    title: raw.jobTitle ?? undefined,
    company_id: raw.accountId != null ? String(raw.accountId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: toIsoDatetime(raw.modifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(
  data: Partial<Contact>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.title !== undefined) out.jobTitle = data.title
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
