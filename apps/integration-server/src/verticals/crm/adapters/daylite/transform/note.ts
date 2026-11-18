import type { Note } from '../../../schema/note'

/**
 * Raw Daylite note as returned by GET /v1/notes and GET /v1/notes/:id.
 *
 * The Daylite REST API uses snake_case field names.
 * The note body is in the `details` field; `title` is a separate optional heading.
 * Relationships (contacts, companies, opportunities) are URL strings.
 *
 * Docs: https://developer.daylite.app/reference/note-details.md
 */
export interface RawDayliteNote {
  /** Relative resource URL, e.g. "/v1/notes/200" */
  self?: string
  /** Note heading / title */
  title?: string
  /** Plain-text note body / contents */
  details?: string
  /** Owner user URL */
  owner?: string
  /** Contact URLs linked to this note */
  contacts?: string[]
  /** Company URLs linked to this note */
  companies?: string[]
  /** Opportunity URLs linked to this note */
  opportunities?: string[]
  /** ISO 8601 creation timestamp (read-only) */
  create_date?: string
  /** ISO 8601 last-modified timestamp (read-only) */
  modify_date?: string
  [key: string]: unknown
}

function extractId(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/(\d+)$/)
  return match ? match[1] : undefined
}

export function transformNote(raw: RawDayliteNote): Note {
  const selfId = extractId(raw.self)
  const ownerId = extractId(raw.owner)
  const contactId = extractId(raw.contacts?.[0])
  const companyId = extractId(raw.companies?.[0])
  const dealId = extractId(raw.opportunities?.[0])

  return {
    id: selfId ?? String(raw['id'] ?? ''),
    content: raw.details ?? raw.title ?? '',
    contact_id: contactId,
    company_id: companyId,
    deal_id: dealId,
    owner_id: ownerId,
    created_at: raw.create_date ?? undefined,
    updated_at: raw.modify_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.details = data.content
  if (data.owner_id !== undefined) out.owner = `/v1/users/${data.owner_id}`
  if (data.contact_id !== undefined) {
    out.contacts = [`/v1/contacts/${data.contact_id}`]
  }
  if (data.company_id !== undefined) {
    out.companies = [`/v1/companies/${data.company_id}`]
  }
  if (data.deal_id !== undefined) {
    out.opportunities = [`/v1/opportunities/${data.deal_id}`]
  }
  return out
}
