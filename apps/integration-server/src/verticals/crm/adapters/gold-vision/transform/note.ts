/**
 * Gold-Vision does not expose a dedicated notes entity via the REST API.
 * Notes in Gold-Vision are stored as activity records of type "Note".
 *
 * This module is intentionally minimal — it maps activity records of type
 * "Note" to the canonical Note schema when needed.
 *
 * Wire field reference (activity entity, type = Note):
 *   id            — unique record identifier
 *   notes         — note body text
 *   contactId     — linked Contact id
 *   accountId     — linked Account id
 *   opportunityId — linked Opportunity id
 *   ownerId       — author / assigned user id
 *   createdDate   — ISO 8601 creation timestamp
 *   modifiedDate  — ISO 8601 last-modified timestamp
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawGoldVisionNote {
  id?: string | number
  notes?: string
  contactId?: string | number
  accountId?: string | number
  opportunityId?: string | number
  ownerId?: string | number
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawGoldVisionNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.notes ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.accountId != null ? String(raw.accountId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: toIsoDatetime(raw.modifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(
  data: Partial<Note>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.notes = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
