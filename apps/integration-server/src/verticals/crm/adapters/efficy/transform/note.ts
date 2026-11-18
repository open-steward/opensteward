import type { Note } from '../../../schema/note'

// Efficy entity: Note (memo/note)
export interface RawEfficyNote {
  K_NOTE?: number
  TEXT?: string
  K_CONTACT?: number
  K_COMPANY?: number
  K_OPPORTUNITY?: number
  K_ASSIGNED?: number
  CREATEDON?: string
  MODIFIEDON?: string
  [key: string]: unknown
}

export function transformNote(raw: RawEfficyNote): Note {
  return {
    id: String(raw.K_NOTE ?? ''),
    content: raw.TEXT ?? '',
    contact_id: raw.K_CONTACT != null ? String(raw.K_CONTACT) : undefined,
    company_id: raw.K_COMPANY != null ? String(raw.K_COMPANY) : undefined,
    deal_id: raw.K_OPPORTUNITY != null ? String(raw.K_OPPORTUNITY) : undefined,
    owner_id: raw.K_ASSIGNED != null ? String(raw.K_ASSIGNED) : undefined,
    created_at: raw.CREATEDON,
    updated_at: raw.MODIFIEDON,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.TEXT = data.content
  if (data.contact_id !== undefined) out.K_CONTACT = Number(data.contact_id)
  if (data.company_id !== undefined) out.K_COMPANY = Number(data.company_id)
  if (data.deal_id !== undefined) out.K_OPPORTUNITY = Number(data.deal_id)
  return out
}
