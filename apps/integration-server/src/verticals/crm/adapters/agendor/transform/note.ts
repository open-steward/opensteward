import type { Note } from '../../../schema/note'

export interface RawAgendorNote {
  id: number | string
  text?: string
  person?: { id: number | string } | null
  deal?: { id: number | string } | null
  created_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawAgendorNote): Note {
  return {
    id: String(raw.id),
    content: raw.text ?? '',
    contact_id: raw.person?.id != null ? String(raw.person.id) : undefined,
    deal_id: raw.deal?.id != null ? String(raw.deal.id) : undefined,
    created_at: raw.created_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.person_id = Number(data.contact_id)
  if (data.deal_id !== undefined) out.deal_id = Number(data.deal_id)
  return out
}
