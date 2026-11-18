import type { Contact } from '../../../schema/contact'

// ── Raw Folk types ─────────────────────────────────────────────────────────
//
// `components.schemas.Person` in https://developer.folk.app/schemas/2025-06-09.json
// (GET /v1/people items, GET /v1/people/{personId} data). Only the fields the
// transform reads are typed; the rest ride along in metadata.

export interface RawFolkContact {
  id: string
  firstName?: string
  lastName?: string
  fullName?: string
  jobTitle?: string
  /** "The date and time the person was created, in ISO format." Nullable. */
  createdAt?: string | null
  /** "The first company in the list is the person's primary company." */
  companies?: { id: string; name: string }[]
  /** "The first email address in the list is the person's primary email address." */
  emails?: string[]
  /** "The first phone number in the list is the person's primary phone number." */
  phones?: string[]
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformContact(raw: RawFolkContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName || undefined,
    last_name: raw.lastName || undefined,
    name: raw.fullName || undefined,
    email: raw.emails?.[0] || undefined,
    phone: raw.phones?.[0] || undefined,
    title: raw.jobTitle || undefined,
    company_id: raw.companies?.[0]?.id || undefined,
    created_at: raw.createdAt ?? undefined,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['firstName'] = data.first_name
  if (data.last_name !== undefined) out['lastName'] = data.last_name
  if (data.email !== undefined) out['emailAddresses'] = [{ email: data.email }]
  if (data.phone !== undefined) out['phoneNumbers'] = [{ number: data.phone }]
  if (data.title !== undefined) out['jobTitle'] = data.title
  if (data.company_id !== undefined) out['groupIds'] = [data.company_id]
  if (data.owner_id !== undefined) out['ownerId'] = data.owner_id
  return out
}
