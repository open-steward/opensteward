/**
 * Spiro notes (JSON:API `note` resources) → canonical Note.
 *
 * GET /api/v1/notes ("Returns list of all notes created in Spiro"),
 * documented example item:
 *   { "id": "179", "type": "note",
 *     "attributes": { "id": 179, "subject": "voluptas",
 *       "description": "Voluptatem et necessitatibus repellendus.",
 *       "interacted_at": "2026-09-01T09:57:39.193Z", "custom": {}, "external_id": null },
 *     "relationships": { "user": { "data": { "id": "1041", "type": "user" } } } }
 *
 * The body is `description`. A note whose description is null has no body,
 * and canonical `content` is a required string, so it reads as empty. No
 * contact, company or opportunity relationship is documented on a note.
 *
 * Source: https://developers.spiro.ai/api/docs/v1/openapi.json
 */
import type { Note } from '../../../schema/note'
import { relatedId, type SpiroResource } from '../client'

export interface SpiroNoteAttributes {
  id: number
  subject: string | null
  description: string | null
  interacted_at: string | null
  custom: Record<string, unknown>
  external_id: string | null
}

export type RawSpiroNote = SpiroResource<SpiroNoteAttributes>

export function transformNote(raw: RawSpiroNote): Note {
  const a = raw.attributes
  return {
    id: raw.id,
    content: a.description ?? '',
    owner_id: relatedId(raw, 'user'),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.opportunity_id = data.deal_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
