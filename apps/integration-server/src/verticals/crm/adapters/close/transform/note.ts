import type { Note } from '../../../schema/note'

export interface RawCloseNote {
  id: string
  note: string
  lead_id?: string
  contact_id?: string
  opportunity_id?: string
  user_id?: string
  date_created?: string
  date_updated?: string
  [key: string]: unknown
}

export function transformNote(raw: RawCloseNote): Note {
  return {
    id: raw.id,
    content: raw.note,
    contact_id: raw.contact_id,
    company_id: raw.lead_id,
    deal_id: raw.opportunity_id,
    owner_id: raw.user_id,
    created_at: raw.date_created,
    updated_at: raw.date_updated,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.lead_id = data.company_id
  if (data.deal_id !== undefined) out.opportunity_id = data.deal_id
  if (data.owner_id !== undefined) out.user_id = data.owner_id
  return out
}
