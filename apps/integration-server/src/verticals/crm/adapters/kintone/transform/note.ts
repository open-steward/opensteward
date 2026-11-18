import type { Note } from '../../../schema/note'
import type { KintoneRecord } from '../client'

// NOTE: Kintone field codes are user-configured per app.
// These defaults must match the user's Kintone notes app configuration.
const FIELD_CODES = {
  content: 'content',        // Multiline text field for note content
  contactId: 'contact_id',   // Text/Number field for contact
  companyId: 'company_id',   // Text/Number field for company
  dealId: 'deal_id',         // Text/Number field for deal
  ownerId: 'owner_id',       // Text/Number field for owner
  createdAt: '作成日時',      // Kintone built-in creation datetime
  updatedAt: '更新日時',      // Kintone built-in update datetime
} as const

function fieldValue(raw: KintoneRecord, code: string): string | undefined {
  const v = raw[code]?.value
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformNote(raw: KintoneRecord): Note {
  return {
    id: raw.$id?.value,
    content: fieldValue(raw, FIELD_CODES.content) ?? '',
    contact_id: fieldValue(raw, FIELD_CODES.contactId),
    company_id: fieldValue(raw, FIELD_CODES.companyId),
    deal_id: fieldValue(raw, FIELD_CODES.dealId),
    owner_id: fieldValue(raw, FIELD_CODES.ownerId),
    created_at: fieldValue(raw, FIELD_CODES.createdAt),
    updated_at: fieldValue(raw, FIELD_CODES.updatedAt),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, { value: unknown }> {
  const out: Record<string, { value: unknown }> = {}
  // TODO: field codes must match the user's Kintone notes app configuration
  if (data.content !== undefined) out[FIELD_CODES.content] = { value: data.content }
  if (data.contact_id !== undefined) out[FIELD_CODES.contactId] = { value: data.contact_id }
  if (data.company_id !== undefined) out[FIELD_CODES.companyId] = { value: data.company_id }
  if (data.deal_id !== undefined) out[FIELD_CODES.dealId] = { value: data.deal_id }
  if (data.owner_id !== undefined) out[FIELD_CODES.ownerId] = { value: data.owner_id }
  return out
}
