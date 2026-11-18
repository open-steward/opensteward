import type { Note } from '../../../schema/note'

export interface RawRexNote {
  id?: number
  note?: string
  contact_id?: number | null
  listing_id?: number | null
  user_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawRexNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.note ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    deal_id: raw.listing_id != null ? String(raw.listing_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.contact_id !== undefined) out.contact_id = Number(data.contact_id)
  if (data.deal_id !== undefined) out.listing_id = Number(data.deal_id)
  return out
}
