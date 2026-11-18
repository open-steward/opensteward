import type { Note } from '../../../schema/note'

export interface RawOnePageCrmNote {
  id?: string | number
  text?: string
  contact_id?: string | number
  deal_id?: string | number
  author_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawOnePageCrmNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.text ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.author_id != null ? String(raw.author_id) : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['text'] = data.content
  if (data.contact_id !== undefined) out['contact_id'] = data.contact_id
  if (data.deal_id !== undefined) out['deal_id'] = data.deal_id
  return out
}
