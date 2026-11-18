import type { Note } from '../../../schema/note'

export interface RawSalesflareNote {
  id: number
  note?: string
  account?: { id: number } | null
  contact?: { id: number } | null
  opportunity?: { id: number } | null
  created_by?: { id: number } | null
  creation_time?: string
  modification_time?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSalesflareNote): Note {
  return {
    id: String(raw.id),
    content: raw.note ?? '',
    company_id: raw.account?.id != null ? String(raw.account.id) : undefined,
    contact_id: raw.contact?.id != null ? String(raw.contact.id) : undefined,
    deal_id: raw.opportunity?.id != null ? String(raw.opportunity.id) : undefined,
    owner_id: raw.created_by?.id != null ? String(raw.created_by.id) : undefined,
    created_at: raw.creation_time,
    updated_at: raw.modification_time,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.company_id !== undefined) out.account = { id: Number(data.company_id) }
  if (data.contact_id !== undefined) out.contact = { id: Number(data.contact_id) }
  if (data.deal_id !== undefined) out.opportunity = { id: Number(data.deal_id) }
  return out
}
