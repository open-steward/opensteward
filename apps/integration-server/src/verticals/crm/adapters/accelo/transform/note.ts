import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

/**
 * Accelo notes are a subset of activities where medium = "Note".
 * We surface them via the notes resource by filtering /activities for notes,
 * or via the dedicated note objects if the platform exposes them.
 *
 * This transform reuses RawAcceloActivity shaped objects filtered to note medium.
 */
export interface RawAcceloNote {
  id: string | number
  /** The note body content. */
  body?: string
  /** owner_id — staff member who created the note. */
  owner_id?: string | number
  /** against_type / against_id — what the note is attached to. */
  against_type?: string
  against_id?: string | number
  date_created?: string | number
  date_modified?: string | number
  [key: string]: unknown
}

export function transformNote(raw: RawAcceloNote): Note {
  let contactId: string | undefined
  let companyId: string | undefined
  let dealId: string | undefined

  if (raw.against_id != null && raw.against_type != null) {
    const id = String(raw.against_id)
    const type = raw.against_type.toLowerCase()
    if (type === 'contact') contactId = id
    else if (type === 'company' || type === 'affiliation') companyId = id
    else if (type === 'prospect') dealId = id
  }

  return {
    id: String(raw.id),
    content: raw.body ?? '',
    contact_id: contactId,
    company_id: companyId,
    deal_id: dealId,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: toIsoDatetime(raw.date_created),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.body = data.content
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  // Set medium to Note (title-case) so it creates a note-type activity
  out.medium = 'Note'
  if (data.contact_id !== undefined) {
    out.against_type = 'contact'
    out.against_id = data.contact_id
  } else if (data.company_id !== undefined) {
    out.against_type = 'company'
    out.against_id = data.company_id
  } else if (data.deal_id !== undefined) {
    out.against_type = 'prospect'
    out.against_id = data.deal_id
  }
  return out
}
