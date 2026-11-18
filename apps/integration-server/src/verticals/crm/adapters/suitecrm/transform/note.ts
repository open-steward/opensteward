import type { Note } from '../../../schema/note'

// SuiteCRM Notes module
export interface RawSuiteCrmNote {
  id?: string
  description?: string
  contact_id?: string
  account_id?: string
  parent_id?: string
  parent_type?: string
  created_by?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSuiteCrmNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: (raw.description as string | undefined) ?? '',
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    deal_id: raw.parent_type === 'Opportunities' && raw.parent_id != null
      ? String(raw.parent_id)
      : undefined,
    owner_id: raw.created_by != null ? String(raw.created_by) : undefined,
    created_at: raw.date_entered,
    updated_at: raw.date_modified,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.description = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.deal_id !== undefined) { out.parent_id = data.deal_id; out.parent_type = 'Opportunities' }
  return out
}
