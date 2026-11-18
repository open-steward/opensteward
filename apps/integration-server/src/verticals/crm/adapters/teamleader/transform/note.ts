import type { Note } from '../../../schema/note'

export interface RawTeamleaderNote {
  id: string
  title?: string
  detail?: string
  customer?: { type?: string; id?: string }
  [key: string]: unknown
}

export function transformNote(raw: RawTeamleaderNote): Note {
  return {
    id: raw.id,
    content: raw.detail ?? raw.title ?? '',
    contact_id: raw.customer?.type === 'contact' ? raw.customer.id : undefined,
    company_id: raw.customer?.type === 'company' ? raw.customer.id : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.detail = data.content
  if (data.contact_id !== undefined) out.customer = { type: 'contact', id: data.contact_id }
  else if (data.company_id !== undefined) out.customer = { type: 'company', id: data.company_id }
  return out
}
