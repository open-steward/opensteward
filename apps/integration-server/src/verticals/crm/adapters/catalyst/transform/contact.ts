/**
 * Catalyst contact transform.
 *
 * Catalyst contacts are associated with accounts (companies). The API returns
 * contact records with snake_case field names.
 *
 * Catalyst API ref: https://help.catalyst.io/hc/en-us/articles/34021477455508-Catalyst-API-v1
 */

import type { Contact } from '../../../schema/contact'

export interface RawCatalystContact {
  id: string | number
  first_name?: string
  last_name?: string
  name?: string
  email?: string
  phone?: string
  mobile_phone?: string
  title?: string
  account_id?: string | number
  owner_id?: string | number
  stage?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawCatalystContact): Contact {
  const first = raw.first_name ?? undefined
  const last = raw.last_name ?? undefined
  const derivedName =
    raw.name ??
    ([first, last].filter(Boolean).join(' ') || undefined)

  return {
    id: String(raw.id),
    first_name: first,
    last_name: last,
    name: derivedName,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobile_phone ?? undefined,
    title: raw.title ?? undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    stage: raw.stage ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile_phone = data.mobile
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.stage !== undefined) out.stage = data.stage
  return out
}
