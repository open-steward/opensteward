import type { Note } from '../../../schema/note'

// CorporateStack note entity
// TODO: verify exact field names from API response
export interface RawCorporateStackNote {
  id: string | number
  content?: string
  body?: string
  contact_id?: string | number
  company_id?: string | number
  deal_id?: string | number
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawCorporateStackNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? raw.body ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
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
