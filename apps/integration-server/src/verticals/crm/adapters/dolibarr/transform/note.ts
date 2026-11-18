import type { Note } from '../../../schema/note'

// Dolibarr notes: embedded in actions or thirdparty notes
export interface RawDolibarrNote {
  id?: string | number
  note?: string
  note_private?: string
  note_public?: string
  fk_contact?: string | number
  fk_soc?: string | number
  fk_user?: string | number
  date_creation?: string | number
  date_modification?: string | number
  [key: string]: unknown
}

export function transformNote(raw: RawDolibarrNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.note ?? raw.note_private ?? raw.note_public ?? '',
    contact_id: raw.fk_contact != null ? String(raw.fk_contact) : undefined,
    company_id: raw.fk_soc != null ? String(raw.fk_soc) : undefined,
    owner_id: raw.fk_user != null ? String(raw.fk_user) : undefined,
    created_at: raw.date_creation
      ? new Date(Number(raw.date_creation) * 1000).toISOString()
      : undefined,
    updated_at: raw.date_modification
      ? new Date(Number(raw.date_modification) * 1000).toISOString()
      : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['note_private'] = data.content
  if (data.contact_id !== undefined) out['fk_contact'] = data.contact_id
  if (data.company_id !== undefined) out['fk_soc'] = data.company_id
  return out
}
