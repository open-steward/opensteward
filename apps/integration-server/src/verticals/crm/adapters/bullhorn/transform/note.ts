import type { Note } from '../../../schema/note'

// Bullhorn "Note" entity
export interface RawBullhornNote {
  id: number
  comments?: string
  action?: string
  clientContact?: { id?: number }
  clientCorporation?: { id?: number }
  jobOrder?: { id?: number }
  personReference?: { id?: number }
  dateAdded?: number
  dateLastModified?: number
  [key: string]: unknown
}

export function transformNote(raw: RawBullhornNote): Note {
  return {
    id: String(raw.id),
    content: raw.comments ?? '',
    contact_id: raw.clientContact?.id != null ? String(raw.clientContact.id) : undefined,
    company_id: raw.clientCorporation?.id != null ? String(raw.clientCorporation.id) : undefined,
    deal_id: raw.jobOrder?.id != null ? String(raw.jobOrder.id) : undefined,
    owner_id: raw.personReference?.id != null ? String(raw.personReference.id) : undefined,
    created_at: raw.dateAdded != null ? new Date(raw.dateAdded).toISOString() : undefined,
    updated_at: raw.dateLastModified != null ? new Date(raw.dateLastModified).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.comments = data.content
  if (data.contact_id !== undefined) out.clientContact = { id: Number(data.contact_id) }
  if (data.company_id !== undefined) out.clientCorporation = { id: Number(data.company_id) }
  if (data.deal_id !== undefined) out.jobOrder = { id: Number(data.deal_id) }
  return out
}
