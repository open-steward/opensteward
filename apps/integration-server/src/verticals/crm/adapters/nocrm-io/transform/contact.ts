/**
 * noCRM.io Lead → canonical Contact transform.
 *
 * noCRM.io does not have a first-class "Contact" resource separate from leads.
 * The contact fields (contact_name, email, phone) are embedded directly in the
 * lead object. We surface leads as contacts when callers hit the contacts API.
 *
 * Wire fields (from GET /leads):
 *   id, contact_name, email, phone, tags, created_at, updated_at,
 *   user (assigned user — owner), status
 */

import type { Contact } from '../../../schema/contact'

export interface RawNocrmContact {
  id: number | string
  /** Display name of the prospect */
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  tags?: string[] | null
  created_at?: string | null
  updated_at?: string | null
  /** Assigned user */
  user?: { id?: number | string } | null
  /** Lead status doubles as a lifecycle stage indicator */
  status?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawNocrmContact): Contact {
  const fullName = raw.contact_name ?? undefined
  const nameParts = fullName ? fullName.split(' ') : []
  const firstName = nameParts.length > 0 ? nameParts[0] : undefined
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    owner_id: raw.user?.id != null ? String(raw.user.id) : undefined,
    stage: raw.status ?? undefined,
    tags: Array.isArray(raw.tags) ? raw.tags : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // noCRM stores contact info in the lead's top-level fields
  const nameParts = [data.first_name, data.last_name].filter(Boolean)
  if (nameParts.length > 0) out['contact_name'] = nameParts.join(' ')
  else if (data.name !== undefined) out['contact_name'] = data.name
  if (data.email !== undefined) out['email'] = data.email
  if (data.phone !== undefined) out['phone'] = data.phone
  if (data.tags !== undefined) out['tags'] = data.tags
  // noCRM requires a title for lead creation
  if (out['contact_name'] ?? out['email']) {
    out['title'] = out['contact_name'] ?? out['email']
  }
  return out
}
