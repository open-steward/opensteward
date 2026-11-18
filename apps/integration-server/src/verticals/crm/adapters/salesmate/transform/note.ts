import type { Note } from '../../../schema/note'

// Salesmate Note entity
// NOTE: Notes API not well-documented — using best-effort field mapping
export interface RawSalesmateNote {
  id?: string | number
  note?: string
  content?: string
  contact?: string | number
  company?: string | number
  deal?: string | number
  owner?: { id?: string | number } | string | number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSalesmateNote): Note {
  const ownerId = typeof raw.owner === 'object' && raw.owner !== null
    ? raw.owner.id
    : raw.owner
  return {
    id: String(raw.id ?? ''),
    content: (raw.note ?? raw.content ?? '') as string,
    contact_id: raw.contact != null ? String(raw.contact) : undefined,
    company_id: raw.company != null ? String(raw.company) : undefined,
    deal_id: raw.deal != null ? String(raw.deal) : undefined,
    owner_id: ownerId != null ? String(ownerId) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.contact_id !== undefined) out.contact = data.contact_id
  if (data.company_id !== undefined) out.company = data.company_id
  if (data.deal_id !== undefined) out.deal = data.deal_id
  return out
}
