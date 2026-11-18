import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * Raw person object returned by `GET /v1/people` and `GET /v1/people/:id`
 * in the Groove by Clari sales CRM REST API.
 *
 * Field reference: https://developer.groove.co/
 */
export interface RawGrooveCustomer {
  id: number | string
  /** Primary email address. */
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  /** Full name (may be pre-composed by the API). */
  name?: string | null
  title?: string | null
  phone?: string | null
  company_name?: string | null
  owner_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * Transform a raw Groove person record into the canonical Contact shape.
 */
export function transformContact(raw: RawGrooveCustomer): Contact {
  const id = String(raw.id)

  // Prefer explicit first/last; fall back to splitting the full name.
  let first_name: string | undefined = raw.first_name ?? undefined
  let last_name: string | undefined = raw.last_name ?? undefined

  if (!first_name && !last_name && raw.name) {
    const parts = raw.name.trim().split(/\s+/)
    first_name = parts[0]
    last_name = parts.length > 1 ? parts.slice(1).join(' ') : undefined
  }

  // Compose full name when the API does not supply it.
  const name: string | undefined =
    raw.name ??
    ([first_name, last_name].filter(Boolean).join(' ') || undefined)

  return {
    id,
    first_name,
    last_name,
    name,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    title: raw.title ?? undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    company_id: undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Reverse-map canonical Contact fields to a Groove person update payload
 * (`PUT /v1/people/:id`).
 */
export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (data.email !== undefined) out['email'] = data.email
  if (data.first_name !== undefined) out['first_name'] = data.first_name
  if (data.last_name !== undefined) out['last_name'] = data.last_name

  // Groove stores a single `name` field; prefer explicit full name,
  // fall back to concatenating first + last.
  if (data.name !== undefined) {
    out['name'] = data.name
  } else if (data.first_name !== undefined || data.last_name !== undefined) {
    out['name'] = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }

  if (data.phone !== undefined) out['phone'] = data.phone
  if (data.title !== undefined) out['title'] = data.title

  return out
}
