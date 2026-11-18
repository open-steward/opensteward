import type { Contact } from '../../../schema/contact'

/**
 * Raw Daylite contact object as returned by GET /v1/contacts and
 * GET /v1/contacts/:id.
 *
 * The Daylite REST API uses snake_case field names.
 * Relationships (e.g. companies) are returned as arrays of role-objects
 * containing a `company` URL field, e.g.
 *   { "role": "Client", "department": "Engineering", "company": "/v1/companies/42" }
 *
 * Docs: https://developer.daylite.app/reference/contact-details.md
 */
export interface RawDayliteContact {
  /** Relative resource URL, e.g. "/v1/contacts/123" */
  self?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  nickname?: string
  /** Email address entries */
  emails?: Array<{ address?: string; label?: string }>
  /** Phone number entries */
  phone_numbers?: Array<{ number?: string; label?: string; format?: string }>
  /** Job title (from primary role or top-level field) */
  title?: string
  /**
   * Company role objects.
   * Each entry contains a `company` URL field pointing to the linked company.
   */
  companies?: Array<{ company?: string; role?: string; department?: string; [key: string]: unknown }>
  /** Owner user URL, e.g. "/v1/users/7" */
  owner?: string
  /** ISO 8601 creation timestamp (read-only) */
  create_date?: string
  /** ISO 8601 last-modified timestamp (read-only) */
  modify_date?: string
  [key: string]: unknown
}

/** Extract trailing numeric ID from a Daylite resource URL like "/v1/contacts/123". */
function extractId(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/(\d+)$/)
  return match ? match[1] : undefined
}

export function transformContact(raw: RawDayliteContact): Contact {
  const selfId = extractId(raw.self)
  const firstEmail = raw.emails?.find((e) => e.address)?.address
  const firstPhone = raw.phone_numbers?.find((p) => p.number)?.number
  const firstCompanyId = extractId(raw.companies?.[0]?.company)
  const ownerId = extractId(raw.owner)

  return {
    id: selfId ?? String(raw['id'] ?? ''),
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: firstEmail ?? undefined,
    phone: firstPhone ?? undefined,
    title: raw.title ?? undefined,
    company_id: firstCompanyId,
    owner_id: ownerId,
    created_at: raw.create_date ?? undefined,
    updated_at: raw.modify_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) {
    out.emails = [{ address: data.email, label: 'work' }]
  }
  if (data.phone !== undefined) {
    out.phone_numbers = [{ number: data.phone, label: 'work' }]
  }
  if (data.title !== undefined) out.title = data.title
  return out
}
