import type { Note } from '../../../schema/note'

// SuperOffice doesn't have a dedicated Notes API; we use Appointment/Document
// with a note-type. This is a minimal pass-through for note-like entries.
export interface RawSuperofficeNote {
  AppointmentId?: number
  DocumentId?: number
  Description?: string
  Contact?: { ContactId?: number }
  Associate?: { AssociateId?: number }
  CreatedDate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSuperofficeNote): Note {
  const id = raw.AppointmentId ?? raw.DocumentId ?? 0

  return {
    id: String(id),
    content: raw.Description ?? '',
    company_id: raw.Contact?.ContactId != null ? String(raw.Contact.ContactId) : undefined,
    owner_id: raw.Associate?.AssociateId != null ? String(raw.Associate.AssociateId) : undefined,
    created_at: raw.CreatedDate,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Description = data.content
  if (data.company_id !== undefined) out.Contact = { ContactId: Number(data.company_id) }
  if (data.owner_id !== undefined) out.Associate = { AssociateId: Number(data.owner_id) }
  return out
}
