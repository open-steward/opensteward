import type { Note } from '../../../schema/note'

export interface RawSpotlerNote {
  id: number
  description?: string
  accountid?: number | null
  contactid?: number | null
  created?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSpotlerNote): Note {
  return {
    id: String(raw.id),
    content: raw.description ?? '',
    company_id: raw.accountid != null ? String(raw.accountid) : undefined,
    contact_id: raw.contactid != null ? String(raw.contactid) : undefined,
    created_at: raw.created,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.description = data.content
  if (data.company_id !== undefined) out.accountid = Number(data.company_id)
  if (data.contact_id !== undefined) out.contactid = Number(data.contact_id)
  return out
}
