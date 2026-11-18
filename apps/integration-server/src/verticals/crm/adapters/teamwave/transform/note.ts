import type { Note } from '../../../schema/note'

export interface RawTeamwaveNote {
  id: number
  content: string
  contact_id?: number | null
  organization_id?: number | null
  deal_id?: number | null
  owner_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawTeamwaveNote): Note {
  return {
    id: String(raw.id),
    content: raw.content,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.organization_id != null ? String(raw.organization_id) : undefined,
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
  if (data.contact_id !== undefined) out.contact_id = Number(data.contact_id)
  if (data.company_id !== undefined) out.organization_id = Number(data.company_id)
  if (data.deal_id !== undefined) out.deal_id = Number(data.deal_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
