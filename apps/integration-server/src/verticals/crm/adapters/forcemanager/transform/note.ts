import type { Note } from '../../../schema/note'

// ForceManager Note entity
export interface RawForceManagerNote {
  id?: string | number
  text?: string
  contactId?: string | number
  accountId?: string | number
  opportunityId?: string | number
  salesRepId?: string | number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawForceManagerNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: (raw.text as string | undefined) ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.accountId != null ? String(raw.accountId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.salesRepId != null ? String(raw.salesRepId) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  return out
}
