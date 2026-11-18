import type { Note } from '../../../schema/note'
import type { RagicRecord } from '../client'

// NOTE: Ragic field names are user-configured per sheet.
// These defaults must match the user's Ragic notes sheet configuration.
const FIELDS = {
  content: 'Content',
  contactId: 'Contact ID',
  companyId: 'Company ID',
  dealId: 'Deal ID',
  ownerId: 'Owner ID',
  createdAt: 'Created Date',
  updatedAt: 'Updated Date',
} as const

function fieldValue(raw: RagicRecord, field: string): string | undefined {
  const v = raw[field]
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformNote(raw: RagicRecord): Note {
  return {
    id: raw._ragic_id != null ? String(raw._ragic_id) : '',
    content: fieldValue(raw, FIELDS.content) ?? '',
    contact_id: fieldValue(raw, FIELDS.contactId),
    company_id: fieldValue(raw, FIELDS.companyId),
    deal_id: fieldValue(raw, FIELDS.dealId),
    owner_id: fieldValue(raw, FIELDS.ownerId),
    created_at: fieldValue(raw, FIELDS.createdAt),
    updated_at: fieldValue(raw, FIELDS.updatedAt),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // TODO: field names must match the user's Ragic notes sheet configuration
  if (data.content !== undefined) out[FIELDS.content] = data.content
  if (data.contact_id !== undefined) out[FIELDS.contactId] = data.contact_id
  if (data.company_id !== undefined) out[FIELDS.companyId] = data.company_id
  if (data.deal_id !== undefined) out[FIELDS.dealId] = data.deal_id
  if (data.owner_id !== undefined) out[FIELDS.ownerId] = data.owner_id
  return out
}
