import type { Note } from '../../../schema/note'

// Recruit CRM Note entity
// Docs: https://docs.recruitcrm.io/
export interface RawRecruitCrmNote {
  id?: string | number
  content?: string
  note?: string
  contact_id?: string | number
  company_id?: string | number
  deal_id?: string | number
  owner?: { id?: string | number } | string | number
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export function transformNote(raw: RawRecruitCrmNote): Note {
  const ownerId = typeof raw.owner === 'object' && raw.owner !== null
    ? raw.owner.id
    : raw.owner
  return {
    id: String(raw.id ?? ''),
    content: (raw.content ?? raw.note ?? '') as string,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: ownerId != null ? String(ownerId) : undefined,
    created_at: raw.created_on,
    updated_at: raw.updated_on,
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
