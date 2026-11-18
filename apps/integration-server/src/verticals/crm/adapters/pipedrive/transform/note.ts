import type { Note } from '../../../schema/note'

export interface RawPipedriveNote {
  id: number
  content: string
  person_id?: number | null
  org_id?: number | null
  deal_id?: number | null
  user?: { id: number; name?: string } | null
  add_time?: string
  update_time?: string
  [key: string]: unknown
}

export function transformNote(raw: RawPipedriveNote): Note {
  return {
    id: String(raw.id),
    content: raw.content,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    company_id: raw.org_id != null ? String(raw.org_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.user?.id != null ? String(raw.user.id) : undefined,
    created_at: raw.add_time,
    updated_at: raw.update_time,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.person_id = Number(data.contact_id)
  if (data.company_id !== undefined) out.org_id = Number(data.company_id)
  if (data.deal_id !== undefined) out.deal_id = Number(data.deal_id)
  return out
}
