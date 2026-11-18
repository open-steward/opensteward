import type { Note } from '../../../schema/note'

export interface RawPipelinerNote {
  id: string
  note?: string
  title?: string
  contact_id?: string | null
  lead_oppty_id?: string | null
  owner_id?: string | null
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformNote(raw: RawPipelinerNote): Note {
  return {
    id: String(raw.id),
    content: raw.note ?? raw.title ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    deal_id: raw.lead_oppty_id != null ? String(raw.lead_oppty_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created,
    updated_at: raw.modified,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.deal_id !== undefined) out.lead_oppty_id = data.deal_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
