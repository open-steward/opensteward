import type { Note } from '../../../schema/note'

export interface RawSellsyNote {
  id: number | string
  content?: string
  linked_contacts_ids?: Array<number | string>
  linked_companies_ids?: Array<number | string>
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSellsyNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.linked_contacts_ids?.[0] != null
      ? String(raw.linked_contacts_ids[0])
      : undefined,
    company_id: raw.linked_companies_ids?.[0] != null
      ? String(raw.linked_companies_ids[0])
      : undefined,
    created_at: raw.created,
    updated_at: raw.updated,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.linked_contacts_ids = [data.contact_id]
  if (data.company_id !== undefined) out.linked_companies_ids = [data.company_id]
  return out
}
