import type { Note } from '../../../schema/note'

// Krayin CRM notes (activities with type 'note' or dedicated notes endpoint)
export interface RawKrayinNote {
  id?: string | number
  note?: string
  content?: string
  lead?: { id?: string | number } | null
  person?: { id?: string | number } | null
  organization?: { id?: string | number } | null
  user?: { id?: string | number } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawKrayinNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.note ?? raw.content ?? '',
    contact_id: raw.person?.id != null ? String(raw.person.id) : undefined,
    company_id: raw.organization?.id != null ? String(raw.organization.id) : undefined,
    deal_id: raw.lead?.id != null ? String(raw.lead.id) : undefined,
    owner_id: raw.user?.id != null ? String(raw.user.id) : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['note'] = data.content
  if (data.contact_id !== undefined) out['person_id'] = data.contact_id
  if (data.company_id !== undefined) out['organization_id'] = data.company_id
  if (data.deal_id !== undefined) out['lead_id'] = data.deal_id
  return out
}
