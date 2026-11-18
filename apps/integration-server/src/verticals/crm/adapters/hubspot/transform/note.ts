import type { Note } from '../../../schema/note'

export interface RawHubSpotNote {
  id: string
  properties: {
    hs_note_body?: string
    hubspot_owner_id?: string
    hs_timestamp?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

/**
 * Records a note links to.
 *
 * A HubSpot note has no parent field — it is an engagement that reaches
 * records only through associations, and the object list endpoint does not
 * return them. So these arrive separately, from a batch association read.
 */
export interface NoteLinks {
  contactId?: string | undefined
  companyId?: string | undefined
  dealId?: string | undefined
}

export function transformNote(raw: RawHubSpotNote, links: NoteLinks = {}): Note {
  return {
    id: String(raw.id),
    content: raw.properties.hs_note_body ?? '',
    contact_id: links.contactId,
    company_id: links.companyId,
    deal_id: links.dealId,
    owner_id: raw.properties.hubspot_owner_id ?? undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  if (data.content !== undefined) properties.hs_note_body = data.content
  if (data.owner_id !== undefined) properties.hubspot_owner_id = data.owner_id
  return { properties }
}
