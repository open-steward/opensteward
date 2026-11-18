/**
 * SAP Sales Cloud V2 — Note transform.
 *
 * SAP Sales Cloud V2 does NOT expose a standalone flat "note-service/notes"
 * collection.  Notes are sub-resources attached to parent objects:
 *
 *   /opportunity-service/opportunities/{id}/notes
 *   /account-service/accounts/{id}/notes
 *
 * The adapter surfaces notes by querying the opportunity notes sub-collection.
 * The canonical Note shape is produced from the SAP note sub-resource fields.
 *
 * Key fields (SAP opportunity note sub-resource):
 *   id               — system UUID for the note
 *   text             — free-form note body
 *   accountId        — linked account UUID (optional, on account notes)
 *   contactId        — linked individual UUID (optional)
 *   opportunityId    — parent opportunity UUID (always present for opp notes)
 *   ownerId          — note author UUID
 *   createdAt        — ISO-8601 creation timestamp (may lack timezone offset)
 *   lastModifiedAt   — ISO-8601 last-modified timestamp (may lack timezone offset)
 */
import type { Note } from '../../../schema/note'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSapNote {
  id: string
  text?: string
  accountId?: string
  contactId?: string
  opportunityId?: string
  ownerId?: string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSapNote): Note {
  return {
    id: String(raw.id),
    content: raw.text ?? '',
    contact_id: raw.contactId ?? undefined,
    company_id: raw.accountId ?? undefined,
    deal_id: raw.opportunityId ?? undefined,
    owner_id: raw.ownerId ?? undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.lastModifiedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
