import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * Raw Mixmax contact object (GET /v1/contacts).
 * The /contacts endpoint is deprecated but still functional.
 * Docs: https://developer.mixmax.com/reference/contacts
 */
export interface RawMixmaxContact {
  _id?: string
  id?: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  company?: string
  phone?: string
  title?: string
  createdAt?: string | number
  updatedAt?: string | number
  [key: string]: unknown
}

export function transformContact(raw: RawMixmaxContact): Contact {
  const id = raw._id ?? raw.id ?? ''
  const firstName = raw.firstName ?? undefined
  const lastName = raw.lastName ?? undefined
  const displayName =
    raw.name ??
    ([firstName, lastName].filter(Boolean).join(' ') || undefined)

  return {
    id: String(id),
    first_name: firstName,
    last_name: lastName,
    name: displayName,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    title: raw.title ?? undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.title = data.title
  return out
}
