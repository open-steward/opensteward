import type { Note } from '../../../schema/note'

export interface RawSamdockNote {
  id: string
  text?: string
  contact_id?: string | null
  deal_id?: string | null
  created_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSamdockNote): Note {
  return {
    id: String(raw.id),
    content: raw.text ?? '',
    contact_id: raw.contact_id ? String(raw.contact_id) : undefined,
    deal_id: raw.deal_id ? String(raw.deal_id) : undefined,
    created_at: raw.created_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  return out
}
