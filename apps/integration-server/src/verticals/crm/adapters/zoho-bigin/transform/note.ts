import type { Note } from '../../../schema/note'

export interface RawBiginNote {
  id: string
  Note_Content?: string
  Contact_Id?: { id: string } | null
  Parent_Id?: { id: string } | null
  Owner?: { id: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformNote(raw: RawBiginNote): Note {
  return {
    id: String(raw.id),
    content: raw.Note_Content ?? '',
    contact_id: raw.Contact_Id?.id != null ? String(raw.Contact_Id.id) : undefined,
    deal_id: raw.Parent_Id?.id != null ? String(raw.Parent_Id.id) : undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Note_Content = data.content
  if (data.contact_id !== undefined) out.Contact_Id = { id: data.contact_id }
  if (data.deal_id !== undefined) out.Parent_Id = { id: data.deal_id }
  return out
}
