/**
 * Respond.io ↔ canonical Contact transforms.
 *
 * The documented Contact model (returned in `items` by POST /v2/contact/list
 * and as the body of GET /v2/contact/{identifier}):
 *   id ("Contact ID", integer), firstName, lastName, phone, email, language,
 *   profilePic, countryCode, custom_fields, status (open|closed|blocked),
 *   tags, assignee (User: id, firstName, lastName, email), lifecycle,
 *   created_at ("Unix timestamp in seconds representing when the contact was
 *   created."), isBlocked.
 * The model documents no update timestamp, so updated_at is not mapped.
 *
 * Docs: https://developers.respond.io/docs/api/cab9510b2994a-contact
 */
import type { Contact } from '../../../schema/contact'

export interface RawRespondIoUser {
  id: number
  firstName: string
  lastName: string
  email: string
}

export interface RawRespondIoContact {
  id: number
  firstName?: string
  lastName?: string | null
  phone?: string | null
  email?: string | null
  language?: string | null
  profilePic?: string | null
  countryCode?: string | null
  custom_fields?: Array<{ name: string; value?: string | null }> | null
  status?: 'open' | 'closed' | 'blocked'
  tags?: string[]
  assignee?: RawRespondIoUser | null
  lifecycle?: string | null
  created_at?: number
  isBlocked?: boolean
  [key: string]: unknown
}

export function transformContact(raw: RawRespondIoContact): Contact {
  const nameParts = [raw.firstName, raw.lastName].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  )
  const fullName = nameParts.length > 0 ? nameParts.map((p) => p.trim()).join(' ') : undefined

  const tags =
    Array.isArray(raw.tags) && raw.tags.length > 0
      ? raw.tags.filter((t): t is string => typeof t === 'string')
      : undefined

  return {
    id: String(raw.id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: fullName,
    email: raw.email,
    phone: raw.phone,
    owner_id: raw.assignee ? String(raw.assignee.id) : undefined,
    stage: raw.lifecycle,
    tags: tags && tags.length > 0 ? tags : undefined,
    created_at:
      typeof raw.created_at === 'number'
        ? new Date(raw.created_at * 1000).toISOString()
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.tags !== undefined && Array.isArray(data.tags)) out.tags = data.tags
  return out
}
