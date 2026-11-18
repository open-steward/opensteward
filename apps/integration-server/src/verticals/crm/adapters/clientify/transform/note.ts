import type { Note } from '../../../schema/note'

export interface RawClientifyNote {
  id: string | number
  content?: string
  contact?: string | number | null
  company?: string | number | null
  deal?: string | number | null
  owner?: string | number | null
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformNote(raw: RawClientifyNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.contact != null ? String(raw.contact) : undefined,
    company_id: raw.company != null ? String(raw.company) : undefined,
    deal_id: raw.deal != null ? String(raw.deal) : undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: raw.date_added ?? undefined,
    updated_at: raw.date_modified ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact = data.contact_id
  if (data.company_id !== undefined) out.company = data.company_id
  if (data.deal_id !== undefined) out.deal = data.deal_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
