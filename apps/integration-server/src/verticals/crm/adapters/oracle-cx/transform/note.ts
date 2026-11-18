import type { Note } from '../../../schema/note'

export interface RawOracleCxNote {
  NoteId: number | string
  NoteTitle?: string
  NoteTxt?: string
  PartyId?: number | string | null
  OwnedByPartyId?: number | string | null
  CreatedDate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawOracleCxNote): Note {
  return {
    id: String(raw.NoteId),
    content: raw.NoteTxt ?? raw.NoteTitle ?? '',
    contact_id: raw.PartyId != null ? String(raw.PartyId) : undefined,
    owner_id: raw.OwnedByPartyId != null ? String(raw.OwnedByPartyId) : undefined,
    created_at: raw.CreatedDate,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) {
    out.NoteTxt = data.content
    out.NoteTitle = data.content.substring(0, 255)
  }
  if (data.contact_id !== undefined) out.PartyId = data.contact_id
  if (data.owner_id !== undefined) out.OwnedByPartyId = data.owner_id
  return out
}
