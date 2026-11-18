import type { Note } from '../../../schema/note'

export interface RawCrmComNote {
  id: string
  content?: string
  body?: string
  contact_id?: string
  company_id?: string
  deal_id?: string
  owner_id?: string
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

export function transformNote(raw: RawCrmComNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? raw.body ?? '',
    contact_id: raw.contact_id ? String(raw.contact_id) : undefined,
    company_id: raw.company_id ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id ? String(raw.owner_id) : undefined,
    created_at: raw.created_date,
    updated_at: raw.updated_date,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  return out
}
